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
const trendService = require('../src/services/trendService');

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
      <pubDate>Thu, 12 Nov 2026 20:40:00 -0800</pubDate>
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
      <pubDate>Thu, 12 Nov 2026 18:10:00 -0800</pubDate>
    </item>
    <item>
      <title><![CDATA[local server & hosting]]></title>
      <ht:approx_traffic>50+</ht:approx_traffic>
      <pubDate>Thu, 12 Nov 2026 09:00:00 -0800</pubDate>
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
  assert.match(topics[0].seenAt, /^Thu, 12 Nov 2026/);
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
    assert.match(kenya.topics[0].seenAt, /^2026-11-13/);
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
