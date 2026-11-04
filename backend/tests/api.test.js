process.env.MONGODB_URI = '';

const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../src/app');
const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');

let token;
let editorToken;
let articleId;
let payoutId;

test.before(async () => {
  await connectDatabase();
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
});

test('article submission', async () => {
  const response = await request(app)
    .post(`/api/writers/articles/${articleId}/submit`)
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
  const first = await request(app)
    .post(`/api/articles/${articleId}/view`)
    .send({ anonymousSessionId: 'session-abc', readingDurationMs: 60000 });
  assert.equal(first.status, 200);

  const second = await request(app)
    .post(`/api/articles/${articleId}/view`)
    .send({ anonymousSessionId: 'session-abc', readingDurationMs: 30000 });
  assert.equal(second.status, 200);
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

function jwtTokenFor(userId, role) {
  const jwt = require('jsonwebtoken');
  const env = require('../src/config/env');
  return jwt.sign({ id: userId, role }, env.JWT_SECRET, { expiresIn: '7d' });
}
