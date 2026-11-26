/**
 * RADAR's own ordering of the trending topics, in the open.
 *
 * Google reports what people searched and prints a band - "200+" - beside it.
 * That band is the evidence and is always shown exactly as Google wrote it. What
 * the desk then needs is an order it can argue with: forty topics in feed order
 * is not a news judgement, and an older topic that Google has printed to this
 * server nine times is a different thing from one that appeared a minute ago and
 * vanished. So each topic carries a score whose every part is stored beside it,
 * under the version of the arithmetic that made it.
 *
 * Two rules hold this whole file together:
 * - A number is only ever Google's number. The traffic figure is the band
 *   Google printed ("200+"), never a score we calculated from it. The score is
 *   labelled as ours, sits next to Google's figure, and replaces nothing.
 * - When Google cannot be reached, that is reported. The panel shows the last
 *   topics that really were fetched and says when they were fetched, instead of
 *   pretending the list is fresh or filling it with anything else.
 */
const env = require('../config/env');
const TrendTopic = require('../models/TrendTopic');
const { parseTrendsFeed } = require('../utils/trendRss');
const { trendScore, SCORE_VERSION, weights } = require('../utils/trendScore');
const { clusterTopics } = require('../utils/trendCluster');

const feedUrl = (geo) => `https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`;
// Google answers as a web page otherwise, and a bare "node" user agent is how a
// script gets refused.
const USER_AGENT = 'Mozilla/5.0 (compatible; RADARNewsroom/1.0; +https://ijwi-ry--ukuri.web.app)';
const TIMEOUT_MS = Number(env.TREND_TIMEOUT_MS || 15000);
const CACHE_MS = Math.max(1, Number(env.TREND_CACHE_MINUTES || 15)) * 60 * 1000;
// Observations are a rolling window, not an archive: the free cluster has half a
// gigabyte and the admin only ever looks at the last day or two.
const KEEP_DAYS = 21;

const GEO_NAMES = {
  RW: 'Rwanda',
  UG: 'Uganda',
  KE: 'Kenya',
  TZ: 'Tanzania',
  NG: 'Nigeria',
  ZA: 'South Africa',
  US: 'United States',
  GB: 'United Kingdom',
  IN: 'India',
  FR: 'France',
  DE: 'Germany',
};

const DEFAULT_GEOS = 'RW,UG,KE,TZ,NG,ZA,US';

/** The regions the newsroom watches, set with TREND_GEOS=RW,UG,... */
function watchList() {
  const raw = env.TREND_GEOS || DEFAULT_GEOS;
  const geos = [...new Set(String(raw).split(',').map((item) => item.trim().toUpperCase()).filter((item) => /^[A-Z]{2}$/.test(item)))];
  return geos.length ? geos : DEFAULT_GEOS.split(',');
}

function geoName(geo) {
  if (GEO_NAMES[geo]) return GEO_NAMES[geo];
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(String(geo || '').toUpperCase()) || geo; }
  catch { return geo; }
}

function utcDay(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function dayOffset(days) {
  const now = new Date();
  return utcDay(new Date(now.getTime() - days * 24 * 60 * 60 * 1000));
}

function failed(geo, reason, status) {
  return {
    geo,
    name: geoName(geo),
    ok: false,
    status: status || null,
    reason,
    stale: false,
    topics: [],
    fetchedAt: new Date().toISOString(),
    sourceUrl: feedUrl(geo),
  };
}

/**
 * One topic, presented for the desk.
 *
 * `stored` is what this server already knows about the same topic today - the
 * sighting count and the first time it appeared. A live feed read passes it in
 * from the row the same fetch just wrote; a stale read passes the row itself.
 * Without it the score would have to pretend every topic is being seen for the
 * first time, which is exactly the flattening this list suffers from today.
 */
function present(topic, geo, stored = {}) {
  const headlines = (topic.newsItems || []).slice(0, 5);
  const seenAt = topic.seenAt ? new Date(topic.seenAt) : null;
  const sightings = Number.isFinite(stored.sightings) ? stored.sightings : 1;
  const score = trendScore({
    approxTraffic: topic.approxTraffic,
    trafficLabel: topic.trafficLabel,
    sightings,
    seenAt: topic.seenAt,
    lastSeenAt: stored.lastSeenAt || topic.lastSeenAt,
  });
  return {
    topic: topic.topic,
    trafficLabel: topic.trafficLabel || '',
    approxTraffic: Number.isFinite(topic.approxTraffic) ? topic.approxTraffic : null,
    seenAt: seenAt && !Number.isNaN(seenAt.getTime()) ? seenAt.toISOString() : null,
    sourceUrl: feedUrl(topic.geo || geo),
    picture: topic.picture || headlines[0]?.picture || '',
    headlines: headlines.map((item) => ({ title: item.title, url: item.url, source: item.source, picture: item.picture || '' })),
    // Ours, not Google's: the count this server has read the topic and the
    // number the score came to, with the parts and the version beside it.
    sightings,
    firstSeenAt: stored.firstSeenAt || null,
    score,
  };
}

/** Ordered by our score, with the tie broken by Google's own band. */
function byScore(topics) {
  return [...topics].sort((a, b) => (b.score.total - a.score.total)
    || ((b.approxTraffic || 0) - (a.approxTraffic || 0))
    || String(a.topic).localeCompare(String(b.topic)));
}

/**
 * Store what Google reported today. Re-reading the same feed a minute later is
 * one row with another sighting, not a second copy of the topic.
 *
 * The rows are read back and returned, because the count the desk needs - how
 * many times this server has actually seen the topic today - only exists after
 * the write. One extra query per region per cache window, for a number that is
 * otherwise invisible.
 */
async function record(geo, topics) {
  const sourceUrl = feedUrl(geo);
  const fetchedAt = new Date();
  const names = topics.map((topic) => String(topic.topic).slice(0, 200));
  await Promise.all(topics.map((topic) => {
    const seenAt = Date.parse(topic.seenAt);
    const day = utcDay(Number.isNaN(seenAt) ? fetchedAt : seenAt);
    return TrendTopic.updateOne(
      { provider: 'google-trends', geo, day, topic: String(topic.topic).slice(0, 200) },
      {
        $set: {
          geo,
          day,
          trafficLabel: topic.trafficLabel || '',
          approxTraffic: Number.isFinite(topic.approxTraffic) ? topic.approxTraffic : null,
          seenAt: Number.isNaN(seenAt) ? fetchedAt : new Date(seenAt),
          lastSeenAt: fetchedAt,
          sourceUrl,
          picture: topic.picture || '',
          newsItems: (topic.newsItems || []).slice(0, 5).map((item) => ({
            title: String(item.title || '').slice(0, 300),
            url: String(item.url || '').slice(0, 600),
            source: String(item.source || '').slice(0, 120),
            picture: String(item.picture || '').slice(0, 600),
          })),
        },
        $setOnInsert: { provider: 'google-trends', firstSeenAt: fetchedAt },
        $inc: { sightings: 1 },
      },
      { upsert: true },
    );
  }));
  await TrendTopic.deleteMany({ day: { $lt: dayOffset(KEEP_DAYS) } });
  // The same topic can have rows for several days; the newest one is what today
  // looks like, and the number of days it has held a row is how long it has run.
  const rows = await TrendTopic.find({ provider: 'google-trends', geo, topic: { $in: names } })
    .sort({ day: -1 })
    .lean();
  return rows.reduce((found, row) => {
    const held = found[row.topic];
    found[row.topic] = {
      sightings: held ? held.sightings : row.sightings,
      firstSeenAt: held ? held.firstSeenAt : row.firstSeenAt,
      lastSeenAt: held ? held.lastSeenAt : row.lastSeenAt,
      days: (held?.days || 0) + 1,
    };
    return found;
  }, {});
}

/** The topics we last managed to store for one region. */
async function storedTopics(geo, { days = 2 } = {}) {
  const since = dayOffset(days - 1);
  const docs = await TrendTopic.find({ provider: 'google-trends', geo, day: { $gte: since } })
    .sort({ approxTraffic: -1, lastSeenAt: -1 })
    .limit(40)
    .lean();
  // The row is its own stored record here, so the sightings that made this
  // topic worth a second look are counted rather than assumed to be one.
  return byScore(docs.map((doc) => ({
    ...present(doc, doc.geo, doc),
    storedDay: doc.day,
    lastSeenAt: doc.lastSeenAt,
  })));
}

/**
 * What this server has really seen of one topic, day by day.
 *
 * The rows already exist - a topic is stored once per day - so a history is a
 * read, not a new thing to maintain. Traffic is printed exactly as each day's
 * feed reported it; a day with no sighting is a gap in the list, not a zero.
 */
async function history({ geo, topic, days = KEEP_DAYS } = {}) {
  const wanted = String(topic || '').trim();
  if (!wanted) return null;
  const region = String(geo || '').toUpperCase();
  const window = Math.min(Math.max(Number(days) || 1, 1), KEEP_DAYS);
  const docs = await TrendTopic.find({
    provider: 'google-trends',
    ...(region ? { geo: region } : {}),
    topic: wanted,
    day: { $gte: dayOffset(window - 1) },
  }).sort({ day: 1 }).lean();
  return {
    provider: 'google-trends',
    geo: region || null,
    topic: wanted,
    days: window,
    scoreVersion: SCORE_VERSION,
    sightings: docs.reduce((total, row) => total + (Number(row.sightings) || 0), 0),
    reports: docs.map((row) => ({
      day: row.day,
      geo: row.geo,
      trafficLabel: row.trafficLabel || '',
      approxTraffic: Number.isFinite(row.approxTraffic) ? row.approxTraffic : null,
      sightings: Number(row.sightings) || 0,
      firstSeenAt: row.firstSeenAt || null,
      lastSeenAt: row.lastSeenAt || null,
      score: trendScore({
        approxTraffic: row.approxTraffic,
        trafficLabel: row.trafficLabel,
        sightings: row.sightings,
        seenAt: row.seenAt,
        lastSeenAt: row.lastSeenAt,
      }),
    })),
  };
}

// --- provider call, once per region per cache window ---------------------------

const cache = new Map();
const inflight = new Map();

async function readGeo(geo) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  let body = '';
  try {
    response = await fetch(feedUrl(geo), {
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT, accept: 'application/rss+xml, application/xml, text/xml', 'accept-language': 'en' },
    });
    if (response.ok) body = await response.text();
  } catch (error) {
    return failed(geo, error && error.name === 'AbortError' ? 'TIMEOUT' : 'UNREACHABLE');
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    // 400 is Google's answer for a country it has no trending feed for at all,
    // which includes Rwanda - worth naming because the admin will ask.
    return failed(geo, response.status === 400 ? 'NO_FEED_FOR_GEO' : 'PROVIDER_ERROR', response.status);
  }

  const parsed = parseTrendsFeed(body);
  if (parsed.malformed) return failed(geo, 'UNREADABLE_FEED', response.status);
  if (!parsed.topics.length) return { ...failed(geo, 'EMPTY', response.status), ok: true };

  const stored = await record(geo, parsed.topics);
  return {
    geo,
    name: geoName(geo),
    ok: true,
    status: response.status,
    reason: null,
    stale: false,
    fetchedAt: new Date().toISOString(),
    sourceUrl: feedUrl(geo),
    topics: byScore(parsed.topics.map((topic) => present(topic, geo, stored[String(topic.topic)] || {}))),
  };
}

async function fetchGeo(geo, { force = false } = {}) {
  const held = cachedGeo(geo, force);
  if (held) return held;
  if (inflight.has(geo)) return inflight.get(geo);

  const run = readGeo(geo)
    .then((value) => {
      // A failed read is remembered for far less time than a good one, so the
      // next refresh tries Google again instead of repeating the same error.
      cache.set(geo, { at: Date.now(), value, ttl: value.ok ? CACHE_MS : Math.min(CACHE_MS, 60 * 1000) });
      return value;
    })
    .finally(() => inflight.delete(geo));
  inflight.set(geo, run);
  return run;
}

function cachedGeo(geo, force) {
  const hit = cache.get(geo);
  if (!hit) return null;
  const ttl = hit.ttl || CACHE_MS;
  return !force && Date.now() - hit.at < ttl ? hit.value : null;
}

/**
 * Attach the groups to one region's list.
 *
 * A topic that shares its words with another carries the group it fell into and
 * how many lines that group has, so the desk can read "these four are the same
 * match" without scrolling Google's four spellings of it. The group keeps the
 * traffic of every line in it, because four bands of 200+ is a bigger story than
 * one of them, and the parts stay listed so nothing is hidden behind a sum.
 */
function withClusters(region) {
  const groups = clusterTopics(region.topics.map((item) => ({ topic: item.topic, approxTraffic: item.approxTraffic })));
  const byTopic = new Map();
  const clusters = groups.map((group) => {
    // A line Google printed on its own has no group to belong to; giving it a
    // one-member cluster would let the desk read "grouped" where nothing was.
    if (group.members.length < 2) return null;
    const lines = group.members.map((name) => {
      const found = region.topics.find((item) => item.topic === name);
      if (found) byTopic.set(name, { id: group.key, size: group.members.length, shared: group.shared });
      return {
        topic: name,
        trafficLabel: found?.trafficLabel || '',
        approxTraffic: found?.approxTraffic ?? null,
        score: found?.score || null,
        headlines: found?.headlines?.length || 0,
      };
    });
    return {
      id: group.key,
      label: group.label,
      shared: group.shared,
      size: group.members.length,
      approxTraffic: lines.reduce((total, line) => total + (line.approxTraffic || 0), 0),
      lines,
    };
  }).filter(Boolean);

  return {
    ...region,
    topics: region.topics.map((item) => ({ ...item, cluster: byTopic.get(item.topic) || null })),
    clusters,
    // Four spellings of one match read as four topics is the whole reason the
    // grouping exists, so say how many lines collapsed.
    groupedLines: clusters.reduce((total, group) => total + group.size - 1, 0),
  };
}

async function radar({ force = false, geos = watchList() } = {}) {
  const results = await Promise.all(geos.map(async (geo) => {
    const held = cachedGeo(geo, force) || (await fetchGeo(geo, { force }));
    if (held.ok) return withClusters(held);
    // Google is unreachable right now: show what was really fetched earlier and
    // say plainly that this is what it is.
    const topics = await storedTopics(geo);
    return withClusters({ ...held, stale: topics.length > 0, topics });
  }));

  const live = results.filter((item) => item.ok && !item.stale).length;
  return {
    provider: 'google-trends',
    providerUrl: 'https://trends.google.com/',
    geos: results,
    liveRegions: live,
    cacheMinutes: Math.round(CACHE_MS / 60000),
    checkedAt: new Date().toISOString(),
    // Ours. Naming the version is the point: two numbers from different versions
    // of this formula must never be compared as if they were the same measure.
    scoreVersion: SCORE_VERSION,
    scoreWeights: weights,
    historyDays: KEEP_DAYS,
  };
}

/**
 * The one Google entry a story will be built on. Asked for by the exact topic
 * and region the admin clicked, so an AI draft can only ever be anchored to
 * something a real feed actually reported.
 */
async function evidenceFor(geo, topic) {
  const wanted = String(topic || '').trim();
  if (!wanted) return null;
  const doc = await TrendTopic.findOne({ provider: 'google-trends', geo: String(geo || '').toUpperCase(), topic: wanted })
    .sort({ day: -1, lastSeenAt: -1 })
    .lean();
  if (!doc) return null;
  return {
    provider: doc.provider,
    geo: doc.geo,
    region: geoName(doc.geo),
    day: doc.day,
    topic: doc.topic,
    trafficLabel: doc.trafficLabel || '',
    approxTraffic: Number.isFinite(doc.approxTraffic) ? doc.approxTraffic : null,
    sourceUrl: doc.sourceUrl,
    fetchedAt: doc.lastSeenAt,
    picture: doc.picture || (doc.newsItems || [])[0]?.picture || '',
    headlines: (doc.newsItems || []).slice(0, 5).map((item) => ({
      title: item.title,
      url: item.url,
      source: item.source,
      picture: item.picture || '',
    })),
  };
}

/**
 * The picture and the publisher behind one trend, taken from the headline the
 * feed actually credited. Nothing here is chosen by a machine: it is the image
 * Google printed and the source Google named, or nothing at all.
 */
function photoCreditFor(evidence) {
  const withPhoto = (evidence.headlines || []).find((item) => item.picture);
  if (!withPhoto) return null;
  return {
    url: withPhoto.picture,
    source: withPhoto.source || '',
    articleUrl: withPhoto.url || '',
    caption: withPhoto.title || '',
  };
}

module.exports = { radar, fetchGeo, watchList, geoName, record, storedTopics, history, evidenceFor, photoCreditFor, feedUrl, SCORE_VERSION };
