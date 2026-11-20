process.env.MONGODB_URI = '';

const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../src/app');
const mongoose = require('mongoose');
const Article = require('../src/models/Article');
const ArticleView = require('../src/models/ArticleView');
const Like = require('../src/models/Like');
const Category = require('../src/models/Category');
const User = require('../src/models/User');
const trending = require('../src/services/trendingService');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days) => new Date(Date.now() - days * DAY_MS);

let author;
let newsCategory;
let otherCategory;

async function publish(title, options = {}) {
  return Article.create({
    title,
    slug: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    summary: 'A short summary of the story.',
    content: 'One two three four five six seven eight nine ten words of body text.',
    author: author._id,
    category: (options.category || newsCategory)._id,
    status: 'published',
    publishedAt: options.publishedAt || new Date(),
    views: options.views || 0,
    validViews: options.validViews || 0,
  });
}

// The rows the site writes by itself when a reader opens a story. Trending is
// computed from these, so a test of trending is a test of what was actually
// read and when - not of a counter somebody typed into a form.
async function reads(article, count, at, isValid = true) {
  await ArticleView.insertMany(
    Array.from({ length: count }, () => ({
      articleId: article._id,
      viewedAt: at,
      isValid,
      anonymousSessionId: `session-${Math.random().toString(36).slice(2, 12)}`,
    })),
  );
}

test.before(async () => {
  await connectDatabase();
  author = await User.create({
    fullName: 'Trend Author', username: 'trendauthor', email: 'trend@example.com', password: 'Password123!', role: 'WRITER',
  });
  newsCategory = await Category.create({ name: `Trend News ${Date.now()}`, slug: `trend-news-${Date.now()}` });
  otherCategory = await Category.create({ name: `Trend Other ${Date.now()}`, slug: `trend-other-${Date.now()}` });
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDatabase();
});

test.beforeEach(async () => {
  await Article.deleteMany({});
  await ArticleView.deleteMany({});
  await Like.deleteMany({});
});

test('a story being read today beats one with a hundred times the all-time views', async () => {
  // The shape of the complaint: an old story that once did well, and the day's
  // story that is being opened right now and has barely any total yet.
  const onceHuge = await publish('A story that was huge three weeks ago', {
    publishedAt: daysAgo(21), views: 900, validViews: 500,
  });
  const readNow = await publish('The story readers are opening this morning', {
    publishedAt: daysAgo(2), views: 3, validViews: 3,
  });
  await reads(onceHuge, 40, daysAgo(21));
  await reads(readNow, 12, new Date());

  await trending.refresh();

  const response = await request(app).get('/api/trending');
  assert.equal(response.status, 200);
  const titles = response.body.data.articles.map((article) => article.title);
  assert.equal(titles.indexOf('The story readers are opening this morning'), 0,
    `trending led with ${titles[0]}; old news had pushed the day's story off the top`);
  assert.ok(titles.indexOf('A story that was huge three weeks ago') > 0,
    'the old story is still on the list - it is not deleted, it is just not trending');

  // ...and "Popular" still means the career total, because that is what the
  // word means and what the writer's earnings are built on.
  const popular = await request(app).get('/api/articles?sort=popular&limit=10');
  assert.equal(popular.body.data.articles[0].title, 'A story that was huge three weeks ago');
});

test('attention decays, so last week reads stop holding the shelf up', async () => {
  const hotThisWeek = await publish('Read heavily yesterday', { publishedAt: daysAgo(1) });
  const hotLastWeek = await publish('Read heavily nine days ago', { publishedAt: daysAgo(10) });
  await reads(hotThisWeek, 10, daysAgo(1));
  await reads(hotLastWeek, 30, daysAgo(9));

  await trending.refresh();

  const titles = (await request(app).get('/api/trending')).body.data.articles.map((a) => a.title);
  assert.ok(titles.indexOf('Read heavily yesterday') < titles.indexOf('Read heavily nine days ago'),
    'a third of the reads, three days more recent, still outranks the older burst');
});

test('a story with no reads at all is placed by when it was published', async () => {
  const fromLastMonth = await publish('Nothing has opened this in six weeks', { publishedAt: daysAgo(42) });
  const fromToday = await publish('Published five minutes ago', { publishedAt: daysAgo(0) });
  assert.ok(fromLastMonth && fromToday);

  await trending.refresh();

  const titles = (await request(app).get('/api/trending')).body.data.articles.map((a) => a.title);
  assert.equal(titles.indexOf('Published five minutes ago'), 0,
    'the newsroom newest story leads when readers have not chosen yet');
});

test('a trending list inside a section keeps its filter', async () => {
  const elsewhere = await publish('A big story in another section', { category: otherCategory, publishedAt: daysAgo(1) });
  await reads(elsewhere, 50, new Date());
  const inSection = await publish('The most read story in this section', { category: newsCategory, publishedAt: daysAgo(3) });
  await reads(inSection, 8, new Date());

  await trending.refresh();

  const response = await request(app).get(`/api/articles?category=${newsCategory.slug}&sort=trending&limit=20`);
  assert.equal(response.status, 200);
  const titles = response.body.data.articles.map((a) => a.title);
  assert.deepEqual(titles, ['The most read story in this section'],
    'the section page shows its own stories, in trending order');
});

test('a like is readers voting, so it lifts the story it is given to', async () => {
  // Two stories that were published and read identically; the only difference
  // is that people pressed Like on one of them today.
  const liked = await publish('Read and appreciated', { publishedAt: daysAgo(3) });
  const seenOnly = await publish('Read but not appreciated', { publishedAt: daysAgo(3) });
  await reads(liked, 5, daysAgo(3));
  await reads(seenOnly, 5, daysAgo(3));
  await Like.create({ article: liked._id, user: author._id, createdAt: new Date() });

  await trending.refresh();

  const titles = (await request(app).get('/api/trending')).body.data.articles.map((a) => a.title);
  assert.ok(titles.indexOf('Read and appreciated') < titles.indexOf('Read but not appreciated'),
    'the liked story ranks above the story that was only opened');
});

test('the standing is stored on the story, so the read itself stays cheap', async () => {
  const story = await publish('One dozen reads today', { publishedAt: daysAgo(1) });
  await reads(story, 12, new Date());

  await trending.refresh();

  const stored = await Article.findById(story._id).lean();
  assert.ok(Number(stored.trendingScore) > 10, `score stored as ${stored.trendingScore}`);
  assert.ok(stored.trendingComputedAt, 'and it says when it was worked out');
  // The counters a writer is paid on are untouched by any of this.
  assert.equal(stored.validViews, 0, 'the career total is not a trending number');

  const before = await Article.findById(story._id).select('trendingScore').lean();
  await request(app).get('/api/trending');
  const after = await Article.findById(story._id).select('trendingScore').lean();
  assert.equal(after.trendingScore, before.trendingScore, 'reading the list does not rewrite it every time');
});
