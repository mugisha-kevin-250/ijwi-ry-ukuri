const mongoose = require('mongoose');
const Article = require('../models/Article');
const ArticleView = require('../models/ArticleView');
const escapeRegex = require('./escapeRegex');

const DAY_MS = 24 * 60 * 60 * 1000;

// The statuses a story can actually hold, read from the schema so a filter never
// drifts from what Article accepts.
const ARTICLE_STATUSES = Article.schema.path('status').enumValues;

// A reader or writer can type anything into ?page / ?limit, so every bound is
// parsed to a safe integer and clamped server-side rather than trusted.
function pagination(query, { defaultLimit = 20, maxLimit = 50 } = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const parsed = Number.parseInt(query.limit, 10);
  const limit = Number.isFinite(parsed) ? Math.min(maxLimit, Math.max(1, parsed)) : defaultLimit;
  return { page, limit, skip: (page - 1) * limit };
}

// Sorting is a fixed menu: an unknown word falls back to the newest rather than
// reaching Mongo as a field the writer never meant to expose.
function sortOption(sort) {
  if (sort === 'oldest') return { createdAt: 1 };
  if (sort === 'views') return { views: -1, validViews: -1 };
  if (sort === 'likes') return { likes: -1 };
  return { createdAt: -1 };
}

// Every listing an author sees is fenced to their own stories; an unknown status
// or search term is simply dropped, never allowed to widen the fence.
function articleFilter(writerId, { status, search } = {}) {
  const filter = { author: writerId };
  if (status && ARTICLE_STATUSES.includes(status)) filter.status = status;
  if (search) filter.title = new RegExp(escapeRegex(String(search).slice(0, 80)), 'i');
  return filter;
}

// UTC calendar day strings, oldest first - the buckets the traffic series is
// filled against. Kept in UTC so the day a count lands on never depends on the
// server's local zone.
function recentDayKeys(days) {
  const now = new Date();
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: days }, (_, index) => new Date(midnight - (days - 1 - index) * DAY_MS).toISOString().slice(0, 10));
}

// Per-article traffic for the writer's OWN articles, measured only from real
// ArticleView rows. An article nobody has opened yet gets an empty series and a
// null average - never a zero dressed up as if it had been measured.
async function buildArticleAnalytics(articles, { seriesDays = 14 } = {}) {
  if (!articles.length) return [];
  const articleIds = articles.map((article) => article._id);

  const [totals, validBuckets] = await Promise.all([
    ArticleView.aggregate([
      { $match: { articleId: { $in: articleIds } } },
      { $group: { _id: '$articleId', viewRows: { $sum: 1 }, averageReadingDuration: { $avg: '$readingDuration' } } },
    ]),
    ArticleView.aggregate([
      {
        $match: {
          articleId: { $in: articleIds },
          isValid: true,
          viewedAt: { $gte: new Date(`${recentDayKeys(seriesDays)[0]}T00:00:00.000Z`) },
        },
      },
      {
        $group: {
          _id: { articleId: '$articleId', day: { $dateToString: { format: '%Y-%m-%d', date: '$viewedAt', timezone: 'UTC' } } },
          validViews: { $sum: 1 },
        },
      },
    ]),
  ]);

  const totalsByArticle = new Map(totals.map((row) => [String(row._id), row]));
  const validByArticle = new Map();
  for (const bucket of validBuckets) {
    const key = String(bucket._id.articleId);
    if (!validByArticle.has(key)) validByArticle.set(key, new Map());
    validByArticle.get(key).set(bucket._id.day, bucket.validViews);
  }

  const dayKeys = recentDayKeys(seriesDays);
  return articles.map((article) => {
    const id = String(article._id);
    const total = totalsByArticle.get(id);
    const hasViewData = Boolean(total && total.viewRows > 0);
    const dayCounts = validByArticle.get(id);
    return {
      _id: article._id,
      title: article.title,
      slug: article.slug,
      // The list screen shows a thumbnail and a standfirst, so the row carries
      // them instead of making the page fetch each story a second time.
      summary: article.summary || '',
      featuredImage: article.featuredImage || null,
      status: article.status,
      publishedAt: article.publishedAt || null,
      views: Number(article.views || 0),
      validViews: Number(article.validViews || 0),
      uniqueViews: Number(article.uniqueViews || 0),
      likes: Number(article.likes || 0),
      commentsCount: Number(article.commentsCount || 0),
      readingTime: Number(article.readingTime || 0),
      viewRows: hasViewData ? total.viewRows : 0,
      hasViewData,
      // Only a real read population produces a series or an average.
      traffic: hasViewData ? dayKeys.map((day) => ({ day, validViews: dayCounts?.get(day) || 0 })) : [],
      averageReadingDurationSeconds: hasViewData ? Math.round(Number(total.averageReadingDuration || 0) * 10) / 10 : null,
    };
  });
}

// The writer's best story by real audience. "Best" only means something once a
// story has actually been read, so an all-zero board returns null rather than
// crowning a story nobody opened.
async function topPublishedArticle(writerId) {
  if (!mongoose.isValidObjectId(writerId)) return null;
  const [article] = await Article.find({ author: writerId, status: 'published' })
    .sort({ validViews: -1, likes: -1 })
    .limit(1)
    .lean();
  return article && Number(article.validViews || 0) > 0 ? article : null;
}

module.exports = {
  pagination,
  sortOption,
  articleFilter,
  buildArticleAnalytics,
  topPublishedArticle,
};
