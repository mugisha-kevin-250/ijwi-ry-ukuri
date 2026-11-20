/**
 * What readers are paying attention to right now.
 *
 * "Trending" was always answered with the biggest all-time view count, which is
 * a scoreboard rather than a trend. A story that collected a thousand reads in
 * September kept the top of the shelf for the rest of the site's life, and a
 * reader who opened Trending was shown old news where the day's news belongs.
 *
 * So a story's standing here is the attention still on it, not the attention it
 * once had. Every open contributes one point that fades as it ages; a read that
 * lasted long enough to count as a real one adds half again; a like is worth
 * three opens, because somebody did more than look; and a story the newsroom
 * published today starts with a point of its own, so new work is not invisible
 * for its first hour. Nothing is invented: every number comes from rows the
 * site already writes when a reader opens a story.
 */
const Article = require('../models/Article');
const ArticleView = require('../models/ArticleView');
const Like = require('../models/Like');

// Three days to fall to a third of its weight. A read that happened last week
// has therefore almost nothing left to say about what is interesting today.
const DECAY_MS = 3 * 24 * 60 * 60 * 1000;
// Reading further back than this only widens the scan for numbers that have
// already decayed into noise.
const LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
// How often the whole site recalculates, however many readers ask. One
// aggregation a minute is a rounding error on the database and it is far more
// often than the news changes.
const REFRESH_MS = 60 * 1000;

/**
 * The decay, written inside the aggregation so the database does the arithmetic
 * on every row instead of sending them here: exp((when - now) / DECAY_MS), which
 * is 1 for something happening now and about 0.37 three days later.
 */
function decayed(field, now) {
  return { $exp: { $divide: [{ $subtract: [`$${field}`, now] }, DECAY_MS] } };
}

async function readHeat(now) {
  const since = new Date(now.getTime() - LOOKBACK_MS);
  const rows = await ArticleView.aggregate([
    { $match: { viewedAt: { $gte: since } } },
    {
      $project: {
        _id: 0,
        articleId: 1,
        heat: decayed('viewedAt', now),
        real: { $cond: [{ $eq: ['$isValid', true] }, 1, 0] },
      },
    },
    {
      $group: {
        _id: '$articleId',
        heat: { $sum: '$heat' },
        realHeat: { $sum: { $multiply: ['$heat', '$real'] } },
      },
    },
  ]);
  const byId = new Map();
  for (const row of rows) {
    if (row._id) byId.set(String(row._id), row);
  }
  return byId;
}

async function likeHeat(now) {
  const since = new Date(now.getTime() - LOOKBACK_MS);
  const rows = await Like.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $project: { _id: 0, article: 1, heat: decayed('createdAt', now) } },
    { $group: { _id: '$article', heat: { $sum: '$heat' } } },
  ]);
  const byId = new Map();
  for (const row of rows) {
    if (row._id) byId.set(String(row._id), row.heat);
  }
  return byId;
}

/**
 * Write the current standing onto every published story.
 *
 * It is stored rather than computed per request because the reader-facing lists
 * sort by it while filtered by section, language and page - and a sort has to be
 * a field the database already knows about to stay on an index. The field is
 * additive, so nothing that reads it today breaks if the calculation is late.
 */
async function refresh() {
  const now = new Date();
  const [reads, likes] = await Promise.all([readHeat(now), likeHeat(now)]);
  const articles = await Article.find({ status: 'published' })
    .select('_id publishedAt createdAt trendingScore trendingComputedAt')
    .lean();

  const ops = [];
  for (const article of articles) {
    const id = String(article._id);
    const seen = reads.get(id);
    const published = new Date(article.publishedAt || article.createdAt || now).getTime();
    const score =
      (seen ? seen.heat : 0)
      + 0.5 * (seen ? seen.realHeat : 0)
      + 3 * (likes.get(id) || 0)
      + Math.exp((published - now.getTime()) / DECAY_MS);

    const rounded = Math.round(score * 1000) / 1000;
    const stored = Number(article.trendingScore || 0);
    // A story that has not moved does not need a write. This is what keeps the
    // minute's work to the handful of stories readers actually moved onto.
    if (Math.abs(stored - rounded) < 0.01 && article.trendingComputedAt) continue;
    ops.push({
      updateOne: {
        filter: { _id: article._id },
        update: { $set: { trendingScore: rounded, trendingComputedAt: now } },
      },
    });
  }

  if (ops.length) await Article.bulkWrite(ops, { ordered: false });
  return { scored: articles.length, updated: ops.length };
}

let lastStartedAt = 0;
let running = null;

/**
 * Recalculate in the background if the last answer is too old.
 *
 * No request ever waits for this. A reader pressing Trending is answered from
 * the field as it stands, which is at worst a minute behind what the site's own
 * view rows say - and a shelf of news is not going to change shape in a minute.
 */
function refreshSoon() {
  if (running || Date.now() - lastStartedAt < REFRESH_MS) return null;
  lastStartedAt = Date.now();
  running = refresh()
    .catch((error) => console.warn('trending standing could not be recalculated:', error.message))
    .finally(() => { running = null; });
  return running;
}

// The order every reader-facing "trending" list uses: attention now, and where
// two stories have the same none of it, the newer one. Not all-time views -
// that is what put old stories on this shelf, and `popular` still says it.
function sortOption() {
  refreshSoon();
  return { trendingScore: -1, publishedAt: -1 };
}

async function top(limit) {
  return Article.find({ status: 'published' })
    .populate('category', 'name slug')
    .sort(sortOption())
    .limit(Number(limit) || 10);
}

module.exports = {
  DECAY_MS,
  LOOKBACK_MS,
  REFRESH_MS,
  refresh,
  refreshSoon,
  sortOption,
  top,
};
