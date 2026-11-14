process.env.MONGODB_URI = '';
process.env.GEMINI_API_KEY = '';

const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const env = require('../src/config/env');
const User = require('../src/models/User');
const Category = require('../src/models/Category');
const Article = require('../src/models/Article');
const ArticleView = require('../src/models/ArticleView');
const WriterWeeklyStat = require('../src/models/WriterWeeklyStat');
const PlatformSetting = require('../src/models/PlatformSetting');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const { getWeekBounds } = require('../src/services/rewardService');

let categoryId;
let counter = 0;

async function makeWriter(tag) {
  const name = `writer${tag}${counter++}`;
  const user = await User.create({
    fullName: `Writer ${tag}`,
    username: name,
    email: `${name}@example.com`,
    password: 'Password123!',
    role: 'WRITER',
  });
  const token = jwt.sign({ id: user._id, role: 'WRITER' }, env.JWT_SECRET, { expiresIn: '7d' });
  return { user, token };
}

async function makeArticle(authorId, fields = {}) {
  const id = counter++;
  return Article.create({
    title: `Story ${id}`,
    slug: `story-${id}`,
    summary: 'A summary',
    content: 'Body text for the story.',
    author: authorId,
    category: categoryId,
    status: 'published',
    ...fields,
  });
}

test.before(async () => {
  await connectDatabase();
  const category = await Category.create({ name: 'General', slug: 'general', description: 'Test category', isActive: true });
  categoryId = category._id;
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDatabase();
});

test('the money endpoints stay wrapped the way the frontend unwraps them', async () => {
  const { token } = await makeWriter('wrapper');

  const earnings = await request(app).get('/api/writers/me/earnings').set('Authorization', `Bearer ${token}`);
  assert.equal(earnings.status, 200);
  assert.ok(Array.isArray(earnings.body.data.earnings), 'earnings is an array, not an object');

  const payouts = await request(app).get('/api/writers/me/payouts').set('Authorization', `Bearer ${token}`);
  assert.equal(payouts.status, 200);
  assert.ok(Array.isArray(payouts.body.data.payouts), 'payouts is an array, not an object');
});

test('a writer with no ledger gets lastComputedWeek null, never a fake zero', async () => {
  const { user, token } = await makeWriter('noleadger');
  await makeArticle(user._id, { validViews: 0, views: 0 });

  const dashboard = await request(app).get('/api/writers/me/dashboard').set('Authorization', `Bearer ${token}`);
  assert.equal(dashboard.status, 200);
  const data = dashboard.body.data;
  // Nothing has ever been computed, so the honest marker is null - not a 0 the
  // UI could mistake for "you earned nothing this run".
  assert.equal(data.lastComputedWeek, null);
  assert.equal(data.totalEarnings, 0);
  assert.equal(data.previousWeeklyEarnings, 0);
  // Real records with real zero views give a real zero; no article is a winner.
  assert.equal(data.currentEarnings, 0);
  assert.equal(data.topPerformingArticle, null);
  // The rate the server actually pays with, so the frontend stops hardcoding it.
  assert.equal(data.rewardRate, 5000);
  assert.equal(data.minimumPayout, 10000);
});

test('current earnings and the top story are read from real records', async () => {
  const { user, token } = await makeWriter('live');
  const quiet = await makeArticle(user._id, { validViews: 3 });
  const winner = await makeArticle(user._id, { title: 'Crowd Pleaser', slug: 'crowd-pleaser', validViews: 5000, likes: 12 });

  const dashboard = await request(app).get('/api/writers/me/dashboard').set('Authorization', `Bearer ${token}`);
  const data = dashboard.body.data;
  // 5003 cumulative valid views at RWF 5,000 per 1,000 = 25,015 - a real number
  // the live reward formula produces, not a summed placeholder.
  assert.equal(data.currentEarnings, 25015);
  assert.ok(data.topPerformingArticle, 'the busiest story is surfaced');
  assert.equal(String(data.topPerformingArticle._id), String(winner._id));
  assert.equal(data.topPerformingArticle.validViews, 5000);
  assert.notEqual(String(data.topPerformingArticle._id), String(quiet._id));
});

test('weekly pay history the job already wrote is finally readable', async () => {
  const { user, token } = await makeWriter('stats');
  const { weekStart, weekEnd } = getWeekBounds(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  await WriterWeeklyStat.create({
    writerId: user._id,
    weekStart,
    weekEnd,
    totalArticles: 4,
    totalValidViews: 2500,
    totalLikes: 30,
    calculatedReward: 12500,
    status: 'processed',
  });

  const response = await request(app).get('/api/writers/me/weekly-stats').set('Authorization', `Bearer ${token}`);
  assert.equal(response.status, 200);
  const stats = response.body.data.stats;
  assert.ok(Array.isArray(stats));
  assert.equal(stats.length, 1);
  assert.equal(stats[0].calculatedReward, 12500);
  assert.equal(stats[0].totalValidViews, 2500);
});

test('the writer article list paginates, filters, searches and sorts', async () => {
  const { user, token } = await makeWriter('list');
  await makeArticle(user._id, { title: 'Alpha One', slug: 'alpha-one', views: 10, createdAt: new Date('2026-01-01') });
  await makeArticle(user._id, { title: 'Beta Two', slug: 'beta-two', views: 90, createdAt: new Date('2026-02-01') });
  await makeArticle(user._id, { title: 'Alpha Three', slug: 'alpha-three', views: 50, createdAt: new Date('2026-03-01') });
  await makeArticle(user._id, { title: 'Draft Four', slug: 'draft-four', status: 'draft', views: 1 });
  // Another author's story must never leak into this list.
  const other = await makeWriter('other');
  await makeArticle(other.user._id, { title: 'Not Yours', slug: 'not-yours', views: 999 });

  const page = await request(app).get('/api/writers/articles?limit=2&page=2').set('Authorization', `Bearer ${token}`);
  assert.equal(page.status, 200);
  assert.equal(page.body.data.total, 4, 'only this writer owns the four stories');
  assert.equal(page.body.data.limit, 2);
  assert.equal(page.body.data.page, 2);
  assert.equal(page.body.data.totalPages, 2);
  assert.equal(page.body.data.articles.length, 2);

  const capped = await request(app).get('/api/writers/articles?limit=999').set('Authorization', `Bearer ${token}`);
  assert.equal(capped.body.data.limit, 50, 'the limit is clamped server-side');

  const published = await request(app).get('/api/writers/articles?status=published').set('Authorization', `Bearer ${token}`);
  assert.equal(published.body.data.total, 3);
  assert.ok(published.body.data.articles.every((a) => a.status === 'published'));

  const searched = await request(app).get('/api/writers/articles?search=Alpha').set('Authorization', `Bearer ${token}`);
  assert.equal(searched.body.data.total, 2);

  const byViews = await request(app).get('/api/writers/articles?sort=views').set('Authorization', `Bearer ${token}`);
  const viewCounts = byViews.body.data.articles.map((a) => a.views);
  assert.deepEqual(viewCounts, [...viewCounts].sort((a, b) => b - a));

  const oldest = await request(app).get('/api/writers/articles?sort=oldest').set('Authorization', `Bearer ${token}`);
  assert.equal(oldest.body.data.articles[0].title, 'Alpha One');
});

test('an author cannot read another author\'s analytics', async () => {
  const mine = await makeWriter('mine');
  const theirs = await makeWriter('theirs');
  const theirArticle = await makeArticle(theirs.user._id, { validViews: 100 });

  const denied = await request(app)
    .get(`/api/writers/me/analytics/${theirArticle._id}`)
    .set('Authorization', `Bearer ${mine.token}`);
  assert.ok(denied.status === 404 || denied.status === 403, `expected refusal, got ${denied.status}`);

  const list = await request(app).get('/api/writers/me/analytics').set('Authorization', `Bearer ${mine.token}`);
  assert.equal(list.status, 200);
  assert.ok(list.body.data.articles.every((a) => a.validViews !== 100), 'no foreign story in the analytics list');
});

test('an unread article returns nulls, not a zero-filled traffic series', async () => {
  const { user, token } = await makeWriter('unread');
  const article = await makeArticle(user._id, { validViews: 0 });

  const response = await request(app)
    .get(`/api/writers/me/analytics/${article._id}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(response.status, 200);
  const analytics = response.body.data.analytics;
  assert.equal(analytics.hasViewData, false);
  assert.deepEqual(analytics.traffic, []);
  assert.equal(analytics.averageReadingDurationSeconds, null);
});

test('a read article reports a real 14-day series and average dwell', async () => {
  const { user, token } = await makeWriter('read');
  const article = await makeArticle(user._id, { validViews: 3 });
  const now = new Date();
  await ArticleView.create([
    { articleId: article._id, isValid: true, readingDuration: 20, viewedAt: now },
    { articleId: article._id, isValid: true, readingDuration: 20, viewedAt: now },
    { articleId: article._id, isValid: true, readingDuration: 20, viewedAt: now },
  ]);

  const response = await request(app)
    .get(`/api/writers/me/analytics/${article._id}`)
    .set('Authorization', `Bearer ${token}`);
  const analytics = response.body.data.analytics;
  assert.equal(analytics.hasViewData, true);
  assert.equal(analytics.traffic.length, 14);
  assert.equal(analytics.averageReadingDurationSeconds, 20);
  const todayKey = now.toISOString().slice(0, 10);
  const today = analytics.traffic.find((entry) => entry.day === todayKey);
  assert.equal(today.validViews, 3, 'all three valid reads land on the same UTC day');
});

test('the dashboard quotes the rate the server is actually using', async () => {
  await PlatformSetting.create({ key: 'rewardRate', value: 7000 });
  await PlatformSetting.create({ key: 'minimumPayout', value: 15000 });

  const { user, token } = await makeWriter('rate');
  await makeArticle(user._id, { validViews: 1000 });

  const dashboard = await request(app).get('/api/writers/me/dashboard').set('Authorization', `Bearer ${token}`);
  const data = dashboard.body.data;
  assert.equal(data.rewardRate, 7000);
  assert.equal(data.minimumPayout, 15000);
  // 1000 valid views at the live 7,000 rate, proving the real number drives pay.
  assert.equal(data.currentEarnings, 7000);
});
