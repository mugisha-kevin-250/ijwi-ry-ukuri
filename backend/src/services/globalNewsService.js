const crypto = require('crypto');
const env = require('../config/env');
const GlobalNewsItem = require('../models/GlobalNewsItem');
const GlobalNewsSyncState = require('../models/GlobalNewsSyncState');
const geminiService = require('./geminiService');

const MAX_FEEDS = 80;
const MAX_ITEMS_PER_FEED = 60;
const FEED_TIMEOUT_MS = 12000;
const MAX_AGE_DAYS = 30;
const API_URL = 'https://api.worldnewsapi.com/search-news';

function configuredFeeds() {
  let parsed;
  try { parsed = JSON.parse(env.WORLD_NEWS_FEEDS || '[]'); } catch { return []; }
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
function imageFromFeed(block, base) {
  const candidates = [
    (String(block).match(/<enclosure[^>]+url=["']([^"']+)["']/i) || [])[1],
    (String(block).match(/<media:content[^>]+url=["']([^"']+)["']/i) || [])[1],
    (String(block).match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i) || [])[1],
    (String(block).match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1],
  ];
  return safeLink(candidates.find(Boolean) || '', base);
}
function parseFeed(xml, feed) {
  const blocks = [...String(xml || '').matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1\s*>/gi)].slice(0, MAX_ITEMS_PER_FEED);
  return blocks.map((match) => {
    const block = match[2];
    const title = tag(block, 'title').slice(0, 300);
    const description = (tag(block, 'description') || tag(block, 'summary') || tag(block, 'content')).slice(0, 4000);
    const imageUrl = imageFromFeed(block, feed.url);
    const rawLink = tag(block, 'link') || (block.match(/<link[^>]*href=["']([^"']+)["']/i) || [])[1] || '';
    const link = safeLink(rawLink, feed.url);
    const rawDate = tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated') || tag(block, 'date');
    const parsedDate = rawDate ? new Date(rawDate) : null;
    if (!title || !link) return null;
    return {
      title, description, imageUrl, link, sourceName: feed.name, sourceUrl: feed.url,
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

function worldApiItem(article) {
  if (!article || typeof article.title !== 'string' || typeof article.url !== 'string') return null;
  const link = safeLink(article.url);
  if (!link) return null;
  let source;
  try { source = new URL(link); } catch { return null; }
  const published = article.publish_date ? new Date(article.publish_date.replace(' ', 'T') + 'Z') : null;
  const sourceName = String(article.source_name || article.source || source.hostname.replace(/^www\./, '')).slice(0, 120);
  return {
    title: article.title.trim().slice(0, 300),
    description: String(article.summary || article.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000),
    imageUrl: safeLink(String(article.image || article.image_url || ''), link),
    link,
    sourceName,
    sourceUrl: source.origin,
    region: String(article.source_country || 'WORLD').toUpperCase().slice(0, 12),
    language: String(article.language || env.WORLD_NEWS_API_LANGUAGE || 'en').toLowerCase().slice(0, 12),
    publishedAt: published && !Number.isNaN(published.getTime()) ? published : null,
  };
}

async function saveItems(items) {
  let saved = 0;
  let processed = 0;
  for (const item of items) {
    if (!item || !item.title || !item.link) continue;
    const dedupeKey = keyFor(item);
    try {
      const outcome = await GlobalNewsItem.updateOne(
        { dedupeKey },
        { $setOnInsert: { ...item, dedupeKey, reviewStatus: 'unreviewed', fetchedAt: new Date() } },
        { upsert: true },
      );
      saved += Number(outcome.upsertedCount || 0);
      processed += 1;
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }
  return { saved, processed };
}

async function readWorldNewsApi() {
  if (!env.WORLD_NEWS_API_KEY) return { configured: false, skipped: true, fetched: 0, saved: 0, reason: 'WORLD_NEWS_API_KEY is not configured.' };

  const now = new Date();
  const state = await GlobalNewsSyncState.findById('world-news-api').lean();
  if (state?.nextAllowedAt && new Date(state.nextAllowedAt) > now) {
    return {
      configured: true, skipped: true, fetched: 0, saved: 0,
      nextAllowedAt: state.nextAllowedAt,
      quotaLeft: state.quotaLeft || null,
      reason: 'World News API refresh is being rate-limited to protect the daily quota.',
    };
  }

  const intervalMs = env.WORLD_NEWS_API_REFRESH_MINUTES * 60000;
  if (state?.lastAttemptAt && now - new Date(state.lastAttemptAt) < intervalMs) {
    return {
      configured: true, skipped: true, fetched: 0, saved: 0,
      nextAllowedAt: new Date(new Date(state.lastAttemptAt).getTime() + intervalMs),
      quotaLeft: state.quotaLeft || null,
      reason: 'The previous World News API refresh is still within its quota-safe interval.',
    };
  }

  // Claim the refresh window in MongoDB before making the request. The scheduler's
  // distributed lock is the primary guard; this persisted timestamp also protects
  // against restarts and accidental manual refreshes.
  await GlobalNewsSyncState.findByIdAndUpdate('world-news-api', {
    $set: { lastAttemptAt: now, nextAllowedAt: new Date(now.getTime() + intervalMs), lastError: '' },
    $setOnInsert: { _id: 'world-news-api' },
  }, { upsert: true, new: true });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.WORLD_NEWS_API_TIMEOUT_MS);
  try {
    const params = new URLSearchParams({
      language: env.WORLD_NEWS_API_LANGUAGE || 'en',
      categories: 'politics,business,technology,science,health,sports,entertainment,education,environment',
      sort: 'publish-time',
      'sort-direction': 'DESC',
      number: String(env.WORLD_NEWS_API_NUMBER),
    });
    const response = await fetch(API_URL + '?' + params.toString(), {
      method: 'GET',
      headers: { 'x-api-key': env.WORLD_NEWS_API_KEY, accept: 'application/json', 'user-agent': 'RADAR-Newsroom/1.0' },
      signal: controller.signal,
    });
    const quota = {
      quotaRequest: response.headers.get('x-api-quota-request') || '',
      quotaUsed: response.headers.get('x-api-quota-used') || '',
      quotaLeft: response.headers.get('x-api-quota-left') || '',
    };
    if (!response.ok) {
      const errorCode = response.status === 402 ? 'DAILY_QUOTA_EXHAUSTED'
        : response.status === 401 ? 'API_KEY_UNAUTHORIZED'
          : response.status === 429 ? 'API_RATE_LIMITED' : 'HTTP_' + response.status;
      const retryAt = response.status === 402
        ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
        : new Date(Date.now() + (response.status === 429 ? 60 : 15) * 60000);
      await GlobalNewsSyncState.findByIdAndUpdate('world-news-api', {
        $set: { ...quota, lastError: errorCode, nextAllowedAt: retryAt },
      });
      return { configured: true, ok: false, fetched: 0, saved: 0, error: errorCode, quotaLeft: quota.quotaLeft || null, nextAllowedAt: retryAt };
    }
    const payload = await response.json();
    const items = (Array.isArray(payload.news) ? payload.news : []).map(worldApiItem).filter(Boolean);
    const result = await saveItems(items);
    await GlobalNewsSyncState.findByIdAndUpdate('world-news-api', {
      $set: { ...quota, lastSuccessAt: new Date(), lastError: '', nextAllowedAt: new Date(Date.now() + intervalMs) },
    });
    return {
      configured: true, ok: true, fetched: items.length, saved: result.saved,
      available: Number(payload.available || 0),
      quotaRequest: quota.quotaRequest || null,
      quotaUsed: quota.quotaUsed || null,
      quotaLeft: quota.quotaLeft || null,
    };
  } catch (error) {
    const reason = error.name === 'AbortError' ? 'TIMEOUT' : String(error.message || 'API_ERROR').slice(0, 120);
    await GlobalNewsSyncState.findByIdAndUpdate('world-news-api', { $set: { lastError: reason } });
    return { configured: true, ok: false, fetched: 0, saved: 0, error: reason };
  } finally { clearTimeout(timer); }
}

async function refresh() {
  const feeds = configuredFeeds();
  const results = [];
  for (let i = 0; i < feeds.length; i += 5) {
    results.push(...await Promise.all(feeds.slice(i, i + 5).map(readFeed)));
  }

  const rssItems = results.flatMap((result) => result.items);
  const rssSaved = await saveItems(rssItems);
  const api = await readWorldNewsApi();

  await GlobalNewsItem.deleteMany({
    fetchedAt: { $lt: new Date(Date.now() - MAX_AGE_DAYS * 86400000) },
    reviewStatus: { $in: ['unreviewed', 'rejected'] },
  });

  return {
    configured: feeds.length,
    fetched: rssItems.length + Number(api.fetched || 0),
    saved: rssSaved.saved + Number(api.saved || 0),
    processed: rssSaved.processed,
    failed: results.filter((x) => !x.ok).length + (api.ok === false ? 1 : 0),
    feeds: results.map(({ feed, ok, error, items }) => ({ feed, ok, error: error || null, items: items.length })),
    worldNewsApi: api,
    message: !feeds.length && !api.configured
      ? 'Set WORLD_NEWS_API_KEY and/or WORLD_NEWS_FEEDS to enable international news ingestion.'
      : undefined,
  };
}

async function list({ page = 1, limit = 20, region = '', status = '', includeReviewStatus = false } = {}) {
  const safePage = Math.max(1, Math.min(Number(page) || 1, 500));
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 50));
  const filter = {};
  if (region && /^[A-Z]{2,12}$/i.test(region)) filter.region = region.toUpperCase();
  if (['unreviewed', 'reviewing', 'verified', 'rejected'].includes(status)) filter.reviewStatus = status;
  const [items, total] = await Promise.all([
    GlobalNewsItem.find(filter).sort({ publishedAt: -1, fetchedAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit)
      .select(includeReviewStatus ? 'title description imageUrl englishTitle englishDescription draftArticle link sourceName sourceUrl region language publishedAt fetchedAt reviewStatus' : 'title link sourceName sourceUrl region language publishedAt fetchedAt').lean(),
    GlobalNewsItem.countDocuments(filter),
  ]);

  // The admin queue is English-first even when an RSS publisher files in
  // Georgian, Greek or another language. Translate only once and cache the
  // result; the original headline and source language remain available.
  if (includeReviewStatus && geminiService.isConfigured()) {
    const pendingTranslations = items.filter((item) => {
      const language = String(item.language || '').toLowerCase();
      const nonEnglishScript = /[^\x00-\x7F]/.test(String(item.title || ''));
      return !item.englishTitle && (nonEnglishScript || (language && language !== 'en' && !language.startsWith('en-')));
    });
    if (pendingTranslations.length) {
      try {
        const translated = await geminiService.translateGlobalLeadMetadata(pendingTranslations);
        const byId = new Map(translated.map((entry) => [entry.id, entry]));
        await Promise.all(pendingTranslations.map(async (item) => {
          const value = byId.get(String(item._id));
          if (!value?.title) return;
          item.englishTitle = value.title;
          item.englishDescription = value.description || '';
          await GlobalNewsItem.updateOne(
            { _id: item._id },
            { $set: { englishTitle: value.title, englishDescription: value.description || '', translatedAt: new Date() } }
          );
        }));
      } catch (error) {
        console.warn('[global-news] English headline translation unavailable:', error?.message || error);
      }
    }
  }
  return { items, page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) };
}
async function status() {
  const [total, unreviewed, verified, newest, apiState] = await Promise.all([
    GlobalNewsItem.countDocuments(),
    GlobalNewsItem.countDocuments({ reviewStatus: 'unreviewed' }),
    GlobalNewsItem.countDocuments({ reviewStatus: 'verified' }),
    GlobalNewsItem.findOne().sort({ fetchedAt: -1 }).select('fetchedAt').lean(),
    GlobalNewsSyncState.findById('world-news-api').lean(),
  ]);
  return {
    configuredFeeds: configuredFeeds().length,
    worldNewsApiConfigured: Boolean(env.WORLD_NEWS_API_KEY),
    worldNewsApiLastSuccessAt: apiState?.lastSuccessAt || null,
    worldNewsApiNextAllowedAt: apiState?.nextAllowedAt || null,
    worldNewsApiQuotaLeft: apiState?.quotaLeft || null,
    worldNewsApiLastError: apiState?.lastError || null,
    totalLeads: total, unreviewed, verified,
    lastFetchedAt: newest?.fetchedAt || null,
  };
}
module.exports = { configuredFeeds, parseFeed, refresh, list, status, worldApiItem };
