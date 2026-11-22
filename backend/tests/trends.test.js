process.env.MONGODB_URI = '';
// Same reason as the API suite: no machine on this run may reach Gemini.
process.env.GEMINI_API_KEY = '';

const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const env = require('../src/config/env');
const TrendTopic = require('../src/models/TrendTopic');
const User = require('../src/models/User');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const { parseTrendsFeed, trafficBand } = require('../src/utils/trendRss');
const { trendScore, SCORE_VERSION } = require('../src/utils/trendScore');
const { clusterTopics } = require('../src/utils/trendCluster');
const trendService = require('../src/services/trendService');

// Google stamps each topic with the moment it was trending and the radar reads
// only the last two days, so the fixture is built from the real calendar. A
// fixed date would age out of that window and fail one day for a reason that
// has nothing to do with the code.
function sighting(daysAgo, hour, minute = 0) {
  const when = new Date();
  when.setUTCDate(when.getUTCDate() - daysAgo);
  when.setUTCHours(hour, minute, 0, 0);
  return { rfc: when.toUTCString(), day: when.toISOString().slice(0, 10) };
}

const TRENDING = [sighting(1, 20, 40), sighting(1, 18, 10), sighting(1, 9)];

// Google's feed, copied from a real response with the shape it actually has:
// the ht: namespace, an approximate traffic band and the headlines Google
// credits each topic to.
const FEED = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<rss xmlns:atom="http://www.w3.org/2005/Atom" xmlns:ht="https://trends.google.com/trending/rss" version="2.0">
  <channel>
    <title>Daily Search Trends</title>
    <item>
      <title>bryan mbeumo &amp; cameroon</title>
      <ht:approx_traffic>1000+</ht:approx_traffic>
      <pubDate>${TRENDING[0].rfc}</pubDate>
      <ht:news_item>
        <ht:news_item_title>Mbeumo looking to lead by example</ht:news_item_title>
        <ht:news_item_url>https://www.manutd.com/en/news/mbeumo</ht:news_item_url>
        <ht:news_item_source>Manchester United</ht:news_item_source>
      </ht:news_item>
      <ht:news_item>
        <ht:news_item_title>Cameroon name squad</ht:news_item_title>
        <ht:news_item_url>https://example.com/cameroon-squad</ht:news_item_url>
        <ht:news_item_source>Federation</ht:news_item_source>
      </ht:news_item>
    </item>
    <item>
      <title>outlook</title>
      <ht:approx_traffic>200+</ht:approx_traffic>
      <pubDate>${TRENDING[1].rfc}</pubDate>
    </item>
    <item>
      <title><![CDATA[local server & hosting]]></title>
      <ht:approx_traffic>50+</ht:approx_traffic>
      <pubDate>${TRENDING[2].rfc}</pubDate>
    </item>
  </channel>
</rss>`;

function tokenFor(role, tag = '') {
  return async () => {
    const name = `${role.toLowerCase()}${tag}`;
    const user = await User.create({
      fullName: `${role} Person ${tag}`,
      username: name,
      email: `${name}@example.com`,
      password: 'Password123!',
      role,
    });
    return jwt.sign({ id: user._id, role }, env.JWT_SECRET, { expiresIn: '7d' });
  };
}

/**
 * The tests never call Google. This stands in for the network so a feed can be
 * answered, refused or broken on purpose.
 */
function stubFetch(handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push(String(url));
    return handler(String(url), options);
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const httpResponse = (status, body = '') => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => body,
});

test.before(async () => {
  await connectDatabase();
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDatabase();
});

test('the feed is read without changing what Google printed', () => {
  const { topics, malformed } = parseTrendsFeed(FEED);

  assert.equal(malformed, false);
  assert.equal(topics.length, 3);
  assert.equal(topics[0].topic, 'bryan mbeumo & cameroon');
  assert.equal(topics[0].trafficLabel, '1000+');
  assert.equal(topics[0].approxTraffic, 1000);
  assert.equal(topics[0].newsItems.length, 2);
  assert.equal(topics[0].newsItems[0].source, 'Manchester United');
  assert.equal(topics[1].newsItems.length, 0);
  assert.equal(topics[2].topic, 'local server & hosting');
  assert.equal(topics[0].seenAt, TRENDING[0].rfc);
});

test('an answer that is not a feed is reported as unreadable', () => {
  assert.equal(parseTrendsFeed('<html><body>blocked</body></html>').malformed, true);
  assert.equal(parseTrendsFeed('').malformed, true);
  const empty = parseTrendsFeed('<rss><channel></channel></rss>');
  assert.equal(empty.topics.length, 0);
  assert.equal(empty.malformed, false);
});

test('a traffic band keeps its label and only borrows the number', () => {
  assert.deepEqual(trafficBand('200+'), { approxTraffic: 200, trafficLabel: '200+' });
  assert.deepEqual(trafficBand('1,000+'), { approxTraffic: 1000, trafficLabel: '1,000+' });
  assert.deepEqual(trafficBand(''), { approxTraffic: null, trafficLabel: '' });
});

test('reading the same feed twice on a day is one topic with two sightings', async () => {
  const { topics } = parseTrendsFeed(FEED);
  await trendService.record('UG', topics);
  const first = await TrendTopic.find({ provider: 'google-trends', geo: 'UG' }).lean();
  assert.equal(first.length, 3);
  assert.equal(first.find((doc) => doc.topic === 'outlook').sightings, 1);
  assert.match(first[0].sourceUrl, /geo=UG$/);

  await trendService.record('UG', topics);
  const second = await TrendTopic.find({ provider: 'google-trends', geo: 'UG' }).lean();
  assert.equal(second.length, 3);
  assert.equal(second.find((doc) => doc.topic === 'outlook').sightings, 2);

  const stored = await trendService.storedTopics('UG', { days: 400 });
  // Google's own band decides the order, nothing we calculated.
  assert.deepEqual(stored.map((item) => item.topic).slice(0, 2), ['bryan mbeumo & cameroon', 'outlook']);
  assert.equal(stored[0].headlines[0].url, 'https://www.manutd.com/en/news/mbeumo');
});

test('observations older than the window go away', async () => {
  await TrendTopic.create({ provider: 'google-trends', geo: 'UG', day: '2000-01-01', topic: 'an ancient search' });
  await trendService.record('UG', parseTrendsFeed(FEED).topics);
  assert.equal(await TrendTopic.countDocuments({ topic: 'an ancient search' }), 0);
});

test('a live feed fills the radar and is stored with the URL it came from', async () => {
  const stub = stubFetch(() => httpResponse(200, FEED));
  try {
    const results = await trendService.radar({ geos: ['KE'], force: true });
    const kenya = results.geos[0];
    assert.equal(kenya.ok, true);
    assert.equal(kenya.stale, false);
    assert.equal(kenya.topics.length, 3);
    assert.equal(results.liveRegions, 1);
    assert.match(kenya.topics[0].sourceUrl, /trends\.google\.com\/trending\/rss\?geo=KE$/);
    assert.match(kenya.topics[0].seenAt, new RegExp(`^${TRENDING[0].day}`));
    assert.equal(await TrendTopic.countDocuments({ geo: 'KE' }), 3);
  } finally {
    stub.restore();
  }
});

test('a region Google prints no list for is named, not left blank', async () => {
  const stub = stubFetch(() => httpResponse(400));
  try {
    const results = await trendService.radar({ geos: ['RW'], force: true });
    const rwanda = results.geos[0];
    // Rwanda is the country the newsroom is about, so an admin has to be told
    // plainly that Google has no trending list for it.
    assert.equal(rwanda.ok, false);
    assert.equal(rwanda.reason, 'NO_FEED_FOR_GEO');
    assert.equal(rwanda.topics.length, 0);
    assert.equal(results.liveRegions, 0);
  } finally {
    stub.restore();
  }
});

test('when Google cannot be reached the last real topics are shown as stale', async () => {
  await trendService.record('UG', parseTrendsFeed(FEED).topics);
  const stub = stubFetch(() => { throw new Error('socket hang up'); });
  try {
    const results = await trendService.radar({ geos: ['UG'], force: true });
    const uganda = results.geos[0];
    assert.equal(uganda.ok, false);
    assert.equal(uganda.reason, 'UNREACHABLE');
    assert.equal(uganda.stale, true);
    assert.equal(uganda.topics.length, 3);
    assert.ok(uganda.topics[0].lastSeenAt);
    assert.equal(results.liveRegions, 0);
  } finally {
    stub.restore();
  }
});

test('a response that is not a feed is reported as unreadable', async () => {
  const stub = stubFetch(() => httpResponse(200, '<html><body>consent wall</body></html>'));
  try {
    const results = await trendService.radar({ geos: ['TZ'], force: true });
    assert.equal(results.geos[0].reason, 'UNREADABLE_FEED');
  } finally {
    stub.restore();
  }
});

test('only the owner may read the trending feeds', async () => {
  const anonymous = await request(app).get('/api/admin/trends');
  assert.equal(anonymous.status, 401);

  const writer = await tokenFor('WRITER', 'reader')();
  const refused = await request(app).get('/api/admin/trends').set('Authorization', `Bearer ${writer}`);
  assert.equal(refused.status, 403);
});

test('the trend writer only writes a topic Google actually reported', async () => {
  const owner = await tokenFor('ADMIN')();

  const invented = await request(app)
    .post('/api/admin/ai/trends')
    .set('Authorization', `Bearer ${owner}`)
    .send({ geo: 'UG', topic: 'a search nobody made' });
  assert.equal(invented.status, 400);
  assert.match(invented.body.message, /did not report/i);

  // A topic that really came off the feed gets as far as Gemini, which this
  // server has no key for - proving the gate is the data, not the request.
  const real = await request(app)
    .post('/api/admin/ai/trends')
    .set('Authorization', `Bearer ${owner}`)
    .send({ geo: 'UG', topic: 'outlook' });
  assert.equal(real.status, 503);

  const asWriter = await request(app)
    .post('/api/admin/ai/trends')
    .set('Authorization', `Bearer ${await tokenFor('WRITER', 'writer')()}`)
    .send({ geo: 'UG', topic: 'outlook' });
  assert.equal(asWriter.status, 403);
});

// --- task #96: the score, the grouping, and the history -----------------------

const HOUR = 60 * 60 * 1000;

test('the score names its version and shows every part of itself', () => {
  const now = Date.now();
  const hot = trendScore({ approxTraffic: 1000, sightings: 4, seenAt: new Date(now - HOUR).toISOString(), now });

  assert.equal(hot.version, SCORE_VERSION);
  assert.equal(hot.onList, true);
  // The total is the three parts added, not a fourth number nobody can check.
  assert.equal(hot.total, Math.round((hot.parts.traffic + hot.parts.repeat + hot.parts.freshness) * 1000) / 1000);
  assert.ok(hot.parts.traffic > 0);
  assert.ok(hot.parts.repeat > 0);
  assert.ok(hot.parts.freshness > 0);
  assert.match(hot.reason, /1,000 searches/);

  // A bigger band and more sightings both count for more, and an older sighting
  // for less - the ordering has to move the way the news would.
  const small = trendScore({ approxTraffic: 200, sightings: 4, seenAt: new Date(now - HOUR).toISOString(), now });
  const single = trendScore({ approxTraffic: 1000, sightings: 1, seenAt: new Date(now - HOUR).toISOString(), now });
  const stale = trendScore({ approxTraffic: 1000, sightings: 4, seenAt: new Date(now - 20 * HOUR).toISOString(), now });
  assert.ok(hot.total > small.total);
  assert.ok(hot.total > single.total);
  assert.ok(hot.total > stale.total);
});

test('a topic that left the list keeps its history but loses Google\'s number', () => {
  const now = Date.now();
  const gone = trendScore({ approxTraffic: 5000, sightings: 9, seenAt: new Date(now - 40 * HOUR).toISOString(), now });

  // Forty hours old is past the day: the band earns nothing now, and the desk is
  // told that in words rather than left to notice a small number.
  assert.equal(gone.onList, false);
  assert.equal(gone.parts.traffic, 0);
  assert.ok(gone.parts.repeat > 0);
  assert.match(gone.reason, /off today's list/);

  const blind = trendScore({ approxTraffic: 5000, sightings: 9, now });
  assert.equal(blind.ageHours, null);
  assert.equal(blind.parts.traffic, 0, 'a band with no date is not evidence of a search happening now');
  assert.ok(blind.parts.repeat > 0);
  assert.match(blind.reason, /No timestamp/);
});

test('two spellings of one search are grouped, and a different one is not', () => {
  const groups = clusterTopics([
    { topic: 'bryan mbeumo' },
    { topic: 'bryan mbeumo injury update' },
    { topic: 'outlook login' },
    { topic: 'local server hosting' },
  ]);
  const joined = groups.filter((group) => group.members.length > 1);

  assert.equal(joined.length, 1);
  assert.deepEqual(joined[0].members, ['bryan mbeumo', 'bryan mbeumo injury update']);
  assert.ok(joined[0].shared.length > 0);
  // Nothing collapsed is still returned as its own group, so the caller never
  // has to work out which lines fell off the list.
  assert.equal(groups.length, 3);
  assert.ok(groups.some((group) => group.label === 'outlook login'));
});

test('a shared word the whole list is searching is not an event', () => {
  const groups = clusterTopics([
    { topic: 'rwanda news' },
    { topic: 'rwanda football' },
    { topic: 'rwanda weather' },
    { topic: 'rwanda elections' },
    { topic: 'outlook login' },
  ]);
  const big = groups.filter((group) => group.members.length > 1);

  // "rwanda" is on four of five lines: grouping on it would merge the country
  // into one topic, which is the mistake the grouping exists to avoid.
  assert.equal(big.length, 0);
  assert.equal(groups.length, 5);
});

test('the radar orders by our score and hands the desk the groups', async () => {
  const GROUPED = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:atom="http://www.w3.org/2005/Atom" xmlns:ht="https://trends.google.com/trending/rss" version="2.0">
  <channel>
    <item><title>outlook login</title><ht:approx_traffic>200+</ht:approx_traffic><pubDate>${sighting(0, 4).rfc}</pubDate></item>
    <item><title>bryan mbeumo</title><ht:approx_traffic>1000+</ht:approx_traffic><pubDate>${sighting(0, 4).rfc}</pubDate></item>
    <item><title>bryan mbeumo injury update</title><ht:approx_traffic>500+</ht:approx_traffic><pubDate>${sighting(0, 4).rfc}</pubDate></item>
    <item><title>local server hosting</title><ht:approx_traffic>10+</ht:approx_traffic><pubDate>${sighting(0, 4).rfc}</pubDate></item>
  </channel>
</rss>`;
  const stub = stubFetch(() => httpResponse(200, GROUPED));
  try {
    const results = await trendService.radar({ geos: ['ZA'], force: true });
    const southAfrica = results.geos[0];

    assert.equal(results.scoreVersion, SCORE_VERSION);
    assert.ok(results.scoreWeights.freshnessHalfLifeHours > 0);
    assert.equal(typeof results.historyDays, 'number');

    const totals = southAfrica.topics.map((item) => item.score.total);
    assert.deepEqual(totals, [...totals].sort((a, b) => b - a));
    // Google's own band is still printed beside the number we calculated.
    assert.equal(southAfrica.topics[0].trafficLabel, '1000+');
    assert.ok(southAfrica.topics[0].score.parts.traffic > 0);

    const mbeumo = southAfrica.topics.find((item) => item.topic === 'bryan mbeumo');
    const injury = southAfrica.topics.find((item) => item.topic === 'bryan mbeumo injury update');
    assert.ok(mbeumo.cluster, 'the two spellings should be grouped');
    assert.equal(mbeumo.cluster.id, injury.cluster.id);
    assert.equal(mbeumo.cluster.size, 2);
    assert.equal(southAfrica.topics.find((item) => item.topic === 'outlook login').cluster, null);
    assert.equal(southAfrica.groupedLines, 1);
    assert.equal(southAfrica.clusters[0].approxTraffic, 1500);
  } finally {
    stub.restore();
  }
});

test('a topic read again today scores its repeats rather than looking new', async () => {
  const { topics } = parseTrendsFeed(FEED);
  await trendService.record('TZ', topics);
  const second = await trendService.record('TZ', topics);

  assert.ok(second['outlook'].sightings >= 2);
  const stored = await trendService.storedTopics('TZ', { days: 400 });
  const outlook = stored.find((item) => item.topic === 'outlook');
  assert.ok(outlook.sightings >= 2, 'the count has to reach the desk, not stay in the row');
  assert.ok(outlook.score.parts.repeat > 0);
  assert.equal(outlook.score.version, SCORE_VERSION);
});

test('the history is the days this server really stored, and nobody else may read it', async () => {
  const past = new Date();
  past.setUTCDate(past.getUTCDate() - 3);
  const pastDay = past.toISOString().slice(0, 10);
  await TrendTopic.create({
    provider: 'google-trends',
    geo: 'TZ',
    day: pastDay,
    topic: 'outlook',
    trafficLabel: '50+',
    approxTraffic: 50,
    sightings: 3,
    seenAt: past,
    lastSeenAt: past,
  });

  const history = await trendService.history({ geo: 'TZ', topic: 'outlook' });
  assert.equal(history.topic, 'outlook');
  assert.ok(history.reports.length >= 2);
  assert.deepEqual(history.reports.map((row) => row.day), [...history.reports.map((row) => row.day)].sort());
  // Each day is what that day's feed said, with its own score and its own band.
  assert.equal(history.reports[0].day, pastDay);
  assert.equal(history.reports[0].trafficLabel, '50+');
  assert.equal(history.reports[0].score.version, SCORE_VERSION);
  assert.ok(history.sightings >= 5);

  const empty = await trendService.history({ geo: 'TZ', topic: 'a search nobody made' });
  assert.equal(empty.reports.length, 0);

  const anonymous = await request(app).get('/api/admin/trends/history').query({ geo: 'TZ', topic: 'outlook' });
  assert.equal(anonymous.status, 401);
  const writer = await tokenFor('WRITER', 'history')();
  const refused = await request(app).get('/api/admin/trends/history').query({ geo: 'TZ', topic: 'outlook' })
    .set('Authorization', `Bearer ${writer}`);
  assert.equal(refused.status, 403);

  const owner = await tokenFor('ADMIN', 'history-reader')();
  const read = await request(app).get('/api/admin/trends/history').query({ geo: 'TZ', topic: 'outlook' })
    .set('Authorization', `Bearer ${owner}`);
  assert.equal(read.status, 200);
  assert.ok(read.body.data.reports.length >= 2);

  const noTopic = await request(app).get('/api/admin/trends/history').set('Authorization', `Bearer ${owner}`);
  assert.equal(noTopic.status, 400);

  const neverSeen = await request(app).get('/api/admin/trends/history').query({ geo: 'TZ', topic: 'nobody typed this' })
    .set('Authorization', `Bearer ${owner}`);
  assert.equal(neverSeen.status, 200);
  assert.equal(neverSeen.body.data.reports.length, 0);
  assert.match(neverSeen.body.data.note, /never read/i);
});
