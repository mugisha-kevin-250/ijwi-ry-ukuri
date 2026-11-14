/**
 * The admin's view of what people are actually searching for.
 *
 * One provider today - Google's own daily trending-search feed - reached from
 * the server so no key ever sits in the browser. What comes back is stored
 * with the URL it came from, because a trend the newsroom cannot point at is a
 * trend the newsroom made up.
 *
 * Two rules hold this whole file together:
 * - A number is only ever Google's number. The traffic figure is the band
 *   Google printed ("200+"), never a score we calculated from it.
 * - When Google cannot be reached, that is reported. The panel shows the last
 *   topics that really were fetched and says when they were fetched, instead of
 *   pretending the list is fresh or filling it with anything else.
 */
const env = require('../config/env');
const TrendTopic = require('../models/TrendTopic');
const { parseTrendsFeed } = require('../utils/trendRss');

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
  return GEO_NAMES[geo] || geo;
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

function present(topic, geo) {
  const headlines = (topic.newsItems || []).slice(0, 5);
  const seenAt = topic.seenAt ? new Date(topic.seenAt) : null;
  return {
    topic: topic.topic,
    trafficLabel: topic.trafficLabel || '',
    approxTraffic: Number.isFinite(topic.approxTraffic) ? topic.approxTraffic : null,
    seenAt: seenAt && !Number.isNaN(seenAt.getTime()) ? seenAt.toISOString() : null,
    sourceUrl: feedUrl(topic.geo || geo),
    picture: topic.picture || headlines[0]?.picture || '',
    headlines: headlines.map((item) => ({ title: item.title, url: item.url, source: item.source, picture: item.picture || '' })),
  };
}

/**
 * Store what Google reported today. Re-reading the same feed a minute later is
 * one row with another sighting, not a second copy of the topic.
 */
async function record(geo, topics) {
  const sourceUrl = feedUrl(geo);
  const fetchedAt = new Date();
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
}

/** The topics we last managed to store for one region. */
async function storedTopics(geo, { days = 2 } = {}) {
  const since = dayOffset(days - 1);
  const docs = await TrendTopic.find({ provider: 'google-trends', geo, day: { $gte: since } })
    .sort({ approxTraffic: -1, lastSeenAt: -1 })
    .limit(40)
    .lean();
  return docs.map((doc) => ({ ...present(doc, doc.geo), storedDay: doc.day, lastSeenAt: doc.lastSeenAt }));
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

  await record(geo, parsed.topics);
  return {
    geo,
    name: geoName(geo),
    ok: true,
    status: response.status,
    reason: null,
    stale: false,
    fetchedAt: new Date().toISOString(),
    sourceUrl: feedUrl(geo),
    topics: parsed.topics.map((topic) => present(topic, geo)),
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

async function radar({ force = false, geos = watchList() } = {}) {
  const results = await Promise.all(geos.map(async (geo) => {
    const held = cachedGeo(geo, force) || (await fetchGeo(geo, { force }));
    if (held.ok) return held;
    // Google is unreachable right now: show what was really fetched earlier and
    // say plainly that this is what it is.
    const topics = await storedTopics(geo);
    return { ...held, stale: topics.length > 0, topics };
  }));

  const live = results.filter((item) => item.ok && !item.stale).length;
  return {
    provider: 'google-trends',
    providerUrl: 'https://trends.google.com/',
    geos: results,
    liveRegions: live,
    cacheMinutes: Math.round(CACHE_MS / 60000),
    checkedAt: new Date().toISOString(),
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

module.exports = { radar, fetchGeo, watchList, geoName, record, storedTopics, evidenceFor, photoCreditFor, feedUrl };
