process.env.MONGODB_URI = '';
// The owner has no SMTP credentials, and a stray backend/.env must never turn
// these tests into real mail: dotenv leaves already-set variables alone, so
// pinning them empty before the first require keeps every test honest.
process.env.SMTP_HOST = '';
process.env.SMTP_PORT = '';
process.env.SMTP_USER = '';
process.env.SMTP_PASSWORD = '';
process.env.MAIL_FROM_EMAIL = '';
process.env.MAIL_FROM_NAME = '';

const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../src/app');
const mongoose = require('mongoose');
const env = require('../src/config/env');
const nodemailer = require('nodemailer');
const NewsletterSubscriber = require('../src/models/NewsletterSubscriber');
const User = require('../src/models/User');
const Category = require('../src/models/Category');
const Article = require('../src/models/Article');
const mailer = require('../src/services/mailerService');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');

const outbox = [];
// Nothing in this file may reach a network, so the transport is a collector
// and "configured" is faked by mutating the env object the mailer re-reads.
test.mock.method(nodemailer, 'createTransport', () => ({
  sendMail: async (message) => {
    outbox.push(message);
    return { messageId: 'stubbed' };
  },
}));

function fakeConfigured() {
  env.SMTP_HOST = 'smtp.invalid.test';
  env.SMTP_PORT = 587;
  env.MAIL_FROM_EMAIL = 'news@example.org';
}

function tokenFrom(link) {
  const match = link.match(/token=([a-f0-9]{48})/);
  assert.ok(match, 'the mailed link carries a token');
  return match[1];
}

test.before(async () => {
  await connectDatabase();
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDatabase();
});

test('status reports not configured when no SMTP env exists', async () => {
  const response = await request(app).get('/api/newsletter/status');
  assert.equal(response.status, 200);
  assert.equal(response.body.data.configured, false);
  assert.match(response.body.data.reason, /email alerts are not configured/);
});

test('subscribe stores the reader and admits nothing was mailed', async () => {
  const response = await request(app)
    .post('/api/newsletter/subscribe')
    .send({ email: '  Reader@Example.com  ' });

  assert.equal(response.status, 200);
  assert.equal(response.body.data.delivered, false);
  assert.equal(response.body.data.needsConfirmation, true);
  assert.equal(response.body.data.configured, false);

  const subscriber = await NewsletterSubscriber.findOne({ email: 'reader@example.com' });
  assert.ok(subscriber, 'the address is stored lowercased and trimmed');
  assert.equal(subscriber.status, 'pending');
  assert.ok(subscriber.confirmTokenHash, 'a token hash is ready for the confirm link');
});

test('a duplicate subscribe is idempotent', async () => {
  const response = await request(app)
    .post('/api/newsletter/subscribe')
    .send({ email: 'reader@example.com' });

  assert.equal(response.status, 200);
  assert.equal(await NewsletterSubscriber.countDocuments({ email: 'reader@example.com' }), 1);
});

test('a malformed address is refused like the contact form refuses one', async () => {
  const response = await request(app)
    .post('/api/newsletter/subscribe')
    .send({ email: 'not-an-email' });

  assert.equal(response.status, 400);
});

test('send without configuration is skipped, never thrown', async () => {
  const result = await mailer.send({ to: 'reader@example.com', subject: 'x', text: 'y' });
  assert.equal(result.delivered, false);
  assert.equal(result.skipped, 'NOT_CONFIGURED');
});

test('the mailed confirm token works once and the raw token is never stored', async () => {
  fakeConfigured();
  const response = await request(app)
    .post('/api/newsletter/subscribe')
    .send({ email: 'second@example.com' });

  assert.equal(response.status, 200);
  assert.equal(response.body.data.delivered, true, 'with a fake relay the mail really leaves');
  const message = outbox[outbox.length - 1];
  const token = tokenFrom(message.html);

  const raw = JSON.stringify((await NewsletterSubscriber.findOne({ email: 'second@example.com' })).toObject());
  assert.ok(!raw.includes(token), 'the document only ever holds the hash');

  const confirm = await request(app).get(`/api/newsletter/confirm?token=${token}`);
  assert.equal(confirm.status, 200);
  assert.match(confirm.text, /alerts are on/);

  const subscriber = await NewsletterSubscriber.findOne({ email: 'second@example.com' });
  assert.equal(subscriber.status, 'confirmed');
  const confirmedAt = subscriber.confirmedAt;

  // Re-opening an old mail must not re-confirm or move the timestamp.
  await request(app).get(`/api/newsletter/confirm?token=${token}`);
  const again = await NewsletterSubscriber.findOne({ email: 'second@example.com' });
  assert.equal(again.status, 'confirmed');
  assert.equal(again.confirmedAt.getTime(), confirmedAt.getTime());
});

test('announceByEmail mails confirmed readers only', async () => {
  fakeConfigured();
  const before = outbox.length;
  const result = await mailer.announceByEmail('Today in the newsroom', { text: 'A new story is out.' });

  assert.equal(result.total, 1, 'only the confirmed address, not the pending one');
  assert.equal(result.sent, 1);
  assert.equal(result.failed, 0);
  assert.equal(outbox.length, before + 1);
  assert.equal(outbox[outbox.length - 1].to, 'second@example.com');
});

test('unsubscribing stops delivery, and the address can re-subscribe', async () => {
  fakeConfigured();
  const offToken = tokenFrom(outbox[outbox.length - 1].html);
  const unsubscribed = await request(app)
    .post('/api/newsletter/unsubscribe')
    .send({ token: offToken });

  assert.equal(unsubscribed.status, 200);
  assert.equal(unsubscribed.body.data.unsubscribed, true);

  const before = outbox.length;
  const result = await mailer.announceByEmail('More news', { text: 'Another story.' });
  assert.equal(result.total, 0);
  assert.equal(outbox.length, before, 'nothing is mailed to an unsubscribed address');

  const resub = await request(app)
    .post('/api/newsletter/subscribe')
    .send({ email: 'second@example.com' });
  assert.equal(resub.status, 200);
  assert.equal(resub.body.data.needsConfirmation, true);

  const subscriber = await NewsletterSubscriber.findOne({ email: 'second@example.com' });
  assert.equal(subscriber.status, 'pending', 'the one row reactivates instead of duplicating');
  assert.equal(await NewsletterSubscriber.countDocuments({ email: 'second@example.com' }), 1);
});

test('a story going live is what sends the alert mail', async () => {
  fakeConfigured();
  const notificationService = require('../src/services/notificationService');
  const author = await User.create({
    fullName: 'Alert Author', username: 'alertauthor', email: 'alertauthor@example.com', password: 'Password123!', role: 'WRITER',
  });
  const category = await Category.create({ name: 'Alerts', slug: `alerts-${Date.now()}` });
  const article = await Article.create({
    title: 'A story that just went live',
    slug: `live-story-${Date.now()}`,
    summary: 'The newsroom published it five seconds ago.',
    content: 'The body of the story readers will find behind the link.',
    author: author._id,
    category: category._id,
    status: 'published',
    publishedAt: new Date(),
  });
  await NewsletterSubscriber.create({ email: 'lives@example.com', status: 'confirmed' });

  const before = outbox.length;
  const result = await notificationService.announceArticlePublished(article);

  assert.equal(result.email.sent, 1, 'the confirmed reader was mailed');
  const message = outbox[outbox.length - 1];
  assert.equal(outbox.length, before + 1);
  assert.equal(message.to, 'lives@example.com');
  assert.equal(message.subject, 'A story that just went live');
  assert.match(message.html, /\/article\/live-story-\d+/, 'the mail links to the story page');
  assert.match(message.html, /Stop these alerts/, 'and carries the way out');

  const dropped = await NewsletterSubscriber.findOne({ email: 'lives@example.com' }).lean();
  assert.ok(!JSON.stringify(dropped).includes('token='), 'the mailed token is stored only as a hash');
});

test.afterEach(() => {
  // Back to the honest off state, so no later test can mail anything even by
  // accident, and the stubbed transport is never pointed at a real host.
  env.SMTP_HOST = '';
  env.SMTP_PORT = 587;
  env.MAIL_FROM_EMAIL = '';
});
