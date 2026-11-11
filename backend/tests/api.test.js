process.env.MONGODB_URI = '';
// Every machine has to get the same answer from the AI writer, so the tests run
// without a Gemini key and prove what the routes do when none is configured.
process.env.GEMINI_API_KEY = '';

const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../src/app');
const mongoose = require('mongoose');
const Category = require('../src/models/Category');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');

let token;
let editorToken;
let ownerToken;
let articleId;
let articleSlug;
let payoutId;

test.before(async () => {
  await connectDatabase();
  await Category.create({ name: 'General', slug: 'general', description: 'Test category', isActive: true });
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDatabase();
});

test('register', async () => {
  const response = await request(app)
    .post('/api/auth/register')
    .send({ fullName: 'Alice Reader', username: 'alice', email: 'alice@example.com', password: 'Password123!' });

  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);
  token = response.body.data.token;
});

test('login', async () => {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email: 'alice@example.com', password: 'Password123!' });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
});

test('public article access', async () => {
  const response = await request(app).get('/api/articles');
  assert.equal(response.status, 200);
});

test('writer registration', async () => {
  const response = await request(app)
    .post('/api/writers/apply')
    .set('Authorization', `Bearer ${token}`)
    .send({ fullName: 'Alice Writer', username: 'alicewriter', bio: 'I write stories', country: 'Rwanda', language: 'en', reasonForWriting: 'To share news' });

  assert.equal(response.status, 201);
});

test('applying does not hand out the writer role', async () => {
  const status = await request(app)
    .get('/api/writers/me/status')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(status.status, 200);
  assert.equal(status.body.data.role, 'READER');
  assert.equal(status.body.data.application.status, 'pending');

  const categoryResponse = await request(app).get('/api/categories');
  const categoryId = categoryResponse.body.data.categories[0]._id;
  const forbidden = await request(app)
    .post('/api/writers/articles')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Too Early', summary: 'Not approved yet', content: 'Article body', category: categoryId });

  assert.equal(forbidden.status, 403);
});

test('an admin approves the pending application', async () => {
  await request(app)
    .post('/api/auth/register')
    .send({ fullName: 'Approving Admin', username: 'approver', email: 'approver@example.com', password: 'Password123!' });
  const approver = await mongoose.connection.collection('users').findOne({ email: 'approver@example.com' });
  await mongoose.connection.collection('users').updateOne({ _id: approver._id }, { $set: { role: 'ADMIN' } });
  const approverToken = jwtTokenFor(approver._id, 'ADMIN');

  const queue = await request(app)
    .get('/api/admin/writer-requests')
    .set('Authorization', `Bearer ${approverToken}`);

  assert.equal(queue.status, 200);
  assert.ok(queue.body.data.pendingCount >= 1);
  const application = queue.body.data.applications.find((item) => item.user.email === 'alice@example.com');
  assert.ok(application, 'the pending application shows in the admin queue');

  const approved = await request(app)
    .post(`/api/admin/writer-requests/${application._id}/approve`)
    .set('Authorization', `Bearer ${approverToken}`);

  assert.equal(approved.status, 200);
  assert.equal(approved.body.data.user.role, 'WRITER');
  assert.equal(approved.body.data.user.writerStatus, 'approved');
});

test('article creation', async () => {
  const categoryResponse = await request(app).get('/api/categories');
  const categoryId = categoryResponse.body.data.categories[0]._id;

  const response = await request(app)
    .post('/api/writers/articles')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'My First Story', summary: 'A quick summary', content: 'This is full article text', category: categoryId, tags: ['news', 'rwanda'] });

  assert.equal(response.status, 201);
  articleId = response.body.data.article._id;
  articleSlug = response.body.data.article.slug;
});

test('reading time is the words in the story, not its character count', async () => {
  const longContent = `<p>${Array.from({ length: 421 }, () => 'word').join(' ')}</p>`;

  const response = await request(app)
    .put(`/api/writers/articles/${articleId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ content: longContent });

  assert.equal(response.status, 200);
  // 421 words at 200 words a minute, markup excluded.
  assert.equal(response.body.data.article.readingTime, 3);
});

test('writer publishes their own article', async () => {
  const response = await request(app)
    .post(`/api/writers/articles/${articleId}/publish`)
    .set('Authorization', `Bearer ${token}`);

  assert.equal(response.status, 200);
});

test('article approval and publish', async () => {
  const adminUser = await request(app).post('/api/auth/register').send({ fullName: 'Admin User', username: 'admin1', email: 'admin@example.com', password: 'Password123!' });
  const admin = await mongoose.connection.collection('users').findOne({ email: 'admin@example.com' });
  await mongoose.connection.collection('users').updateOne({ _id: admin._id }, { $set: { role: 'ADMIN' } });
  editorToken = jwtTokenFor(admin._id, 'ADMIN');

  const approveResponse = await request(app)
    .put(`/api/editor/articles/${articleId}/approve`)
    .set('Authorization', `Bearer ${editorToken}`);

  assert.equal(approveResponse.status, 200);

  const publishResponse = await request(app)
    .put(`/api/editor/articles/${articleId}/publish`)
    .set('Authorization', `Bearer ${editorToken}`);

  assert.equal(publishResponse.status, 200);
});

test('view tracking and duplicate prevention', async () => {
  // Opening a story sends a zero-duration ping, and that already credits the read.
  const open = await request(app)
    .post(`/api/articles/${articleId}/view`)
    .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)').send({ anonymousSessionId: 'session-abc', readingDurationMs: 0 });
  assert.equal(open.status, 200);
  assert.equal(open.body.data.result.countView, true);
  assert.equal(open.body.data.result.uniqueView, true);
  assert.equal(open.body.data.result.isValid, false);
  assert.equal(open.body.data.views, 1);
  assert.equal(open.body.data.validViews, 0);

  // The dwell report upgrades that same read instead of counting it twice.
  const finish = await request(app)
    .post(`/api/articles/${articleId}/view`)
    .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)').send({ anonymousSessionId: 'session-abc', readingDurationMs: 60000 });
  assert.equal(finish.body.data.result.countView, false);
  assert.equal(finish.body.data.result.upgraded, true);
  assert.equal(finish.body.data.views, 1);
  assert.equal(finish.body.data.validViews, 1);

  const second = await request(app)
    .post(`/api/articles/${articleId}/view`)
    .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)').send({ anonymousSessionId: 'session-abc', readingDurationMs: 30000 });
  assert.equal(second.status, 200);
  assert.equal(second.body.data.result.duplicateBlocked, true);
  assert.equal(second.body.data.views, 1);
  assert.equal(second.body.data.validViews, 1);

  const bounce = await request(app)
    .post(`/api/articles/${articleId}/view`)
    .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)').send({ anonymousSessionId: 'session-xyz', readingDurationMs: 800 });
  assert.equal(bounce.body.data.result.countView, true);
  assert.equal(bounce.body.data.result.isValid, false);
  assert.equal(bounce.body.data.views, 2);

  // Still inside the duplicate window the same reader does not count again.
  const repeatReader = await request(app)
    .post(`/api/articles/${articleId}/view`)
    .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)').send({ anonymousSessionId: 'session-abc', readingDurationMs: 60000 });
  assert.equal(repeatReader.body.data.result.countView, false);

  const newReader = await request(app)
    .post(`/api/articles/${articleId}/view`)
    .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)').send({ anonymousSessionId: 'session-new', readingDurationMs: 20000 });
  assert.equal(newReader.body.data.result.uniqueView, true);
  assert.equal(newReader.body.data.result.isValid, true);
  assert.equal(newReader.body.data.views, 3);
  assert.equal(newReader.body.data.validViews, 2);
});

test('likes are idempotent and report the live count', async () => {
  const like = await request(app)
    .post(`/api/articles/${articleId}/like`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(like.status, 200);
  assert.equal(like.body.data.likes, 1);

  const repeat = await request(app)
    .post(`/api/articles/${articleId}/like`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(repeat.status, 200);
  assert.equal(repeat.body.data.likes, 1);

  // A reader tapping several times lands overlapping requests; that must still
  // leave one like, not one per tap.
  const burst = await Promise.all(
    Array.from({ length: 4 }, () =>
      request(app).post(`/api/articles/${articleId}/like`).set('Authorization', `Bearer ${token}`))
  );
  assert.ok(burst.every((response) => response.status === 200));
  assert.equal(Math.max(...burst.map((response) => response.body.data.likes)), 1);

  const unlike = await request(app)
    .delete(`/api/articles/${articleId}/like`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(unlike.status, 200);
  assert.equal(unlike.body.data.likes, 0);

  const repeatUnlike = await request(app)
    .delete(`/api/articles/${articleId}/like`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(repeatUnlike.status, 200);
  assert.equal(repeatUnlike.body.data.likes, 0);
});

test('likes, comments, bookmarks', async () => {
  const likeResponse = await request(app)
    .post(`/api/articles/${articleId}/like`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(likeResponse.status, 200);

  const commentResponse = await request(app)
    .post(`/api/articles/${articleId}/comments`)
    .set('Authorization', `Bearer ${token}`)
    .send({ content: 'This is a great article' });
  assert.equal(commentResponse.status, 201);

  const bookmarkResponse = await request(app)
    .post(`/api/articles/${articleId}/bookmark`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(bookmarkResponse.status, 200);
});

test('article access reports the reader state', async () => {
  const list = await request(app).get('/api/articles').set('Authorization', `Bearer ${token}`);
  assert.equal(list.status, 200);
  const seen = list.body.data.articles.find((item) => item._id === articleId);
  assert.equal(seen.liked, true);
  assert.equal(seen.bookmarked, true);

  const detail = await request(app).get(`/api/articles/${articleSlug}`).set('Authorization', `Bearer ${token}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.article.liked, true);

  const anon = await request(app).get(`/api/articles/${articleSlug}`);
  assert.equal(anon.body.data.article.liked, undefined);
});

test('writer stats and payout approval', async () => {
  const statsResponse = await request(app)
    .get('/api/writers/me/dashboard')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(statsResponse.status, 200);

  const payoutsResponse = await request(app)
    .get('/api/admin/payouts')
    .set('Authorization', `Bearer ${editorToken}`);
  assert.equal(payoutsResponse.status, 200);
});

test('uploaded images survive an emptied disk', async () => {
  const fs = require('fs');
  const path = require('path');
  const env = require('../src/config/env');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

  const upload = await request(app)
    .post('/api/upload/image')
    .set('Authorization', `Bearer ${token}`)
    .attach('image', png, 'pixel.png');

  assert.equal(upload.status, 200);
  const url = upload.body.data.url;
  assert.match(url, /^\/uploads\/[\w.-]+\.png$/);

  // Render's free plan deletes everything on UPLOAD_DIR between deploys, so the
  // database copy is what readers actually get served.
  fs.rmSync(path.join(env.UPLOAD_DIR, path.basename(url)), { force: true });

  const served = await request(app).get(url);
  assert.equal(served.status, 200);
  assert.equal(served.headers['content-type'], 'image/png');
  assert.deepEqual(served.body, png);
});

function jwtTokenFor(userId, role) {
  const jwt = require('jsonwebtoken');
  const env = require('../src/config/env');
  return jwt.sign({ id: userId, role }, env.JWT_SECRET, { expiresIn: '7d' });
}

test('a published story lands in the admin inbox', async () => {
  const Notification = require('../src/models/Notification');
  const categories = await request(app).get('/api/categories');
  const categoryId = categories.body.data.categories[0]._id;

  const created = await request(app)
    .post('/api/writers/articles')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Inbox Story', summary: 'Something the admin has not seen yet', content: 'Body text of the inbox story.', category: categoryId });
  const newId = created.body.data.article._id;

  const before = await Notification.countDocuments({ type: 'new_story' });
  await request(app).post(`/api/writers/articles/${newId}/publish`).set('Authorization', `Bearer ${token}`);

  const rows = await Notification.find({ type: 'new_story' }).lean();
  assert.ok(rows.length > before, 'publishing should create inbox entries');

  const admin = await mongoose.connection.collection('users').findOne({ email: 'admin@example.com' });
  const author = await mongoose.connection.collection('users').findOne({ email: 'alice@example.com' });
  assert.ok(rows.some((row) => String(row.user) === String(admin._id)), 'the admin is told');
  assert.ok(!rows.some((row) => String(row.user) === String(author._id)), 'nobody tells the author their own story');

  const list = await request(app).get('/api/notifications').set('Authorization', `Bearer ${editorToken}`);
  assert.equal(list.status, 200);
  assert.ok(list.body.data.unread > 0);
  assert.ok(list.body.data.notifications[0].relatedEntity.slug);
});

test('live broadcast is admin only, one at a time, and open to all viewers', async () => {
  const denied = await request(app).post('/api/live').set('Authorization', `Bearer ${token}`).send({ title: 'Reader tries' });
  assert.equal(denied.status, 403);

  const started = await request(app).post('/api/live').set('Authorization', `Bearer ${editorToken}`).send({ title: 'Newsroom live', description: 'Ask us anything' });
  assert.equal(started.status, 201);
  const firstId = started.body.data.live._id;
  assert.equal(started.body.data.live.sharePath, `/live/${firstId}`);

  const current = await request(app).get('/api/live/current');
  assert.equal(current.body.data.live._id, firstId);

  const second = await request(app).post('/api/live').set('Authorization', `Bearer ${editorToken}`).send({ title: 'Second live' });
  const secondId = second.body.data.live._id;

  const afterCurrent = await request(app).get('/api/live/current');
  assert.equal(afterCurrent.body.data.live._id, secondId);
  const firstAgain = await request(app).get(`/api/live/${firstId}`);
  assert.equal(firstAgain.body.data.live.status, 'ended');

  const comments = await request(app).get(`/api/live/${secondId}/comments`);
  assert.equal(comments.status, 200);
  assert.deepEqual(comments.body.data.comments, []);

  const ended = await request(app).post(`/api/live/${secondId}/end`).set('Authorization', `Bearer ${editorToken}`);
  assert.equal(ended.status, 200);
  const nothing = await request(app).get('/api/live/current');
  assert.equal(nothing.body.data.live, null);
});

test('only the site owner reaches the AI writer', async () => {
  const forbidden = await request(app)
    .get('/api/admin/ai/status')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(forbidden.status, 403);
});

test('the AI writer reports what the server can do', async () => {
  await request(app)
    .post('/api/auth/register')
    .send({ fullName: 'Owner Of AI', username: 'aiowner', email: 'aiowner@example.com', password: 'Password123!' });
  const owner = await mongoose.connection.collection('users').findOne({ email: 'aiowner@example.com' });
  await mongoose.connection.collection('users').updateOne({ _id: owner._id }, { $set: { role: 'ADMIN' } });
  ownerToken = jwtTokenFor(owner._id, 'ADMIN');

  const status = await request(app)
    .get('/api/admin/ai/status')
    .set('Authorization', `Bearer ${ownerToken}`);

  assert.equal(status.status, 200);
  assert.equal(status.body.data.configured, false);
  assert.equal(status.body.data.autoPublish, false);

  const tooShort = await request(app)
    .post('/api/admin/ai/generate')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ topic: 'ai' });
  assert.equal(tooShort.status, 400);

  const noKey = await request(app)
    .post('/api/admin/ai/generate')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ topic: 'Rwanda coffee exports' });
  assert.equal(noKey.status, 503);
});

test('a reviewed AI story waits as a draft even in auto mode', async () => {
  const toggled = await request(app)
    .put('/api/admin/ai/auto-publish')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ enabled: true });
  assert.equal(toggled.status, 200);
  assert.equal(toggled.body.data.autoPublish, true);

  const categories = await request(app).get('/api/categories');
  const categoryId = categories.body.data.categories[0]._id;

  const drafted = await request(app)
    .post('/api/admin/ai/articles')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({
      title: 'Reviewed AI Story',
      summary: 'The admin read this one before anyone else.',
      content: 'First paragraph.\n\nSecond paragraph.',
      category: categoryId,
      tags: ['AI', 'Test'],
      publish: false
    });

  assert.equal(drafted.status, 201);
  assert.equal(drafted.body.data.article.status, 'draft');
  assert.equal(drafted.body.data.article.aiGenerated, true);
  assert.ok(drafted.body.data.article.slug.startsWith('reviewed-ai-story-'));

  const visible = await request(app).get('/api/articles');
  const titles = visible.body.data.articles.map((item) => item.title);
  assert.ok(!titles.includes('Reviewed AI Story'), 'a draft AI story is not served to readers');

  const listed = await request(app)
    .get('/api/admin/ai/articles')
    .set('Authorization', `Bearer ${ownerToken}`);
  assert.equal(listed.status, 200);
  assert.ok(listed.body.data.articles.some((item) => item.title === 'Reviewed AI Story'));
  assert.ok(listed.body.data.pendingReview >= 1);
});

test('the owner publishing an AI story sends it live', async () => {
  const categories = await request(app).get('/api/categories');
  const categoryId = categories.body.data.categories[0]._id;

  const published = await request(app)
    .post('/api/admin/ai/articles')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({
      title: 'Published AI Story',
      summary: 'The owner clicked publish.',
      content: 'One paragraph of a published story.',
      category: categoryId,
      publish: true
    });

  assert.equal(published.status, 201);
  assert.equal(published.body.data.article.status, 'published');
  assert.ok(published.body.data.article.publishedAt);

  const visible = await request(app).get('/api/articles');
  const titles = visible.body.data.articles.map((item) => item.title);
  assert.ok(titles.includes('Published AI Story'));
});
