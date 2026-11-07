process.env.MONGODB_URI = '';

const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../src/app');
const mongoose = require('mongoose');
const Category = require('../src/models/Category');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');

let token;
let editorToken;
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
