const crypto = require('crypto');
const env = require('../config/env');
const GlobalNewsItem = require('../models/GlobalNewsItem');

const MAX_FEEDS = 80;
const MAX_ITEMS_PER_FEED = 60;
const FEED_TIMEOUT_MS = 12000;
const MAX_AGE_DAYS = 30;

function configuredFeeds() {
  let parsed;
  try { parsed = JSON.parse(env.GLOBAL_NEWS_FEEDS || '[]'); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  return parsed.slice(0, MAX_FEEDS).filter((feed) => {
    if (!feed || typeof feed.url !== 'string' || typeof feed.name !== 'string') return false;
    try {
      const url = new URL(feed.url);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch { return false; }
  }).map((feed) => ({
    url: feed.url,
    name: String(feed.name).trim().slice(0, 120),
    region: String(feed.region || 'WORLD').trim().toUpperCase().slice(0, 12),
    language: String(feed.language || 'en').trim().toLowerCase().slice(0, 12),
  })).filter((feed) => feed.name);
}

function decodeXml(value = '') {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\s+/g, ' ').trim();
}
function tag(block, name) {
  const match = block.match(new RegExp('<(?:[\\w.-]+:)?' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?' + name + '\\s*>', 'i'));
  return match ? decodeXml(match[1]) : '';
}
function safeLink(raw, base) {
  try {
    const url = new URL(raw, base);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : '';
  } catch { return ''; }
}
function parseFeed(xml, feed) {
  const blocks = [...String(xml || '').matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1\s*>/gi)].slice(0, MAX_ITEMS_PER_FEED);
  return blocks.map((match) => {
    const block = match[2];
    const title = tag(block, 'title').slice(0, 300);
    const rawLink = tag(block, 'link') || (block.match(/<link[^>]*href=["']([^"']+)["']/i) || [])[1] || '';
    const link = safeLink(rawLink, feed.url);
    const rawDate = tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated') || tag(block, 'date');
    const parsedDate = rawDate ? new Date(rawDate) : null;
    if (!title || !link) return null;
    return {
      title, link, sourceName: feed.name, sourceUrl: feed.url,
      region: feed.region, language: feed.language,
      publishedAt: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null,
    };
  }).filter(Boolean);
}
function keyFor(item) {
  return crypto.createHash('sha256').update(item.link.toLowerCase()).digest('hex');
}
async function readFeed(feed) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const response = await fetch(feed.url, {
      signal: controller.signal,
      redirect: 'error',
      headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml', 'user-agent': 'RADAR-Newsroom/1.0' },
    });
    if (!response.ok) throw new Error('HTTP_' + response.status);
    const xml = await response.text();
    if (xml.length > 2_000_000) throw new Error('FEED_TOO_LARGE');
    return { feed: feed.name, items: parseFeed(xml, feed), ok: true };
  } catch (error) {
    return { feed: feed.name, items: [], ok: false, error: error.name === 'AbortError' ? 'TIMEOUT' : String(error.message || 'FEED_ERROR').slice(0, 80) };
  } finally { clearTimeout(timer); }
}
async function refresh() {
  const feeds = configuredFeeds();
  if (!feeds.length) return { configured: 0, fetched: 0, saved: 0, failed: 0, message: 'Set GLOBAL_NEWS_FEEDS to a JSON array of permitted HTTPS RSS/Atom sources.' };
  const results = [];
  // Small batches keep a free Render instance from opening dozens of sockets at once.
  for (let i = 0; i < feeds.length; i += 5) {
    results.push(...await Promise.all(feeds.slice(i, i + 5).map(readFeed)));
  }
  let saved = 0;
  let processed = 0;
  for (const result of results) {
    for (const item of result.items) {
      try {
        const outcome = await GlobalNewsItem.updateOne(
          { dedupeKey: keyFor(item) },
          { $setOnInsert: { ...item, dedupeKey: keyFor(item), reviewStatus: 'unreviewed', fetchedAt: new Date() } },
          { upsert: true },
        );
        saved += Number(outcome.upsertedCount || 0);
        processed += 1;
      } catch (error) {
        if (error.code !== 11000) throw error;
      }
    }
  }
  await GlobalNewsItem.deleteMany({ fetchedAt: { $lt: new Date(Date.now() - MAX_AGE_DAYS * 86400000) }, reviewStatus: { $in: ['unreviewed', 'rejected'] } });
  return { configured: feeds.length, fetched: results.reduce((n, x) => n + x.items.length, 0), saved, processed, failed: results.filter((x) => !x.ok).length, feeds: results.map(({ feed, ok, error, items }) => ({ feed, ok, error: error || null, items: items.length })) };
}
async function list({ page = 1, limit = 20, region = '', status = '' } = {}) {
  const safePage = Math.max(1, Math.min(Number(page) || 1, 500));
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 50));
  const filter = {};
  if (region && /^[A-Z]{2,12}$/i.test(region)) filter.region = region.toUpperCase();
  if (['unreviewed', 'reviewing', 'verified', 'rejected'].includes(status)) filter.reviewStatus = status;
  const [items, total] = await Promise.all([
    GlobalNewsItem.find(filter).sort({ publishedAt: -1, fetchedAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit)
      .select('title link sourceName sourceUrl region language publishedAt fetchedAt reviewStatus').lean(),
    GlobalNewsItem.countDocuments(filter),
  ]);
  return { items, page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) };
}
async function status() {
  const [configured, total, unreviewed, verified, newest] = await Promise.all([
    Promise.resolve(configuredFeeds().length),
    GlobalNewsItem.countDocuments(),
    GlobalNewsItem.countDocuments({ reviewStatus: 'unreviewed' }),
    GlobalNewsItem.countDocuments({ reviewStatus: 'verified' }),
    GlobalNewsItem.findOne().sort({ fetchedAt: -1 }).select('fetchedAt').lean(),
  ]);
  return { configuredFeeds: configured, totalLeads: total, unreviewed, verified, lastFetchedAt: newest?.fetchedAt || null };
}
module.exports = { configuredFeeds, parseFeed, refresh, list, status };
