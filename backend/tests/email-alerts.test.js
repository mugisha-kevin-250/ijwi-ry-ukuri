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
// A relay that takes ten seconds to answer is the case this file exists to
// catch, so the stub can be made to stall. It is 0 for every other test.
let mailDelayMs = 0;
// Nothing in this file may reach a network, so the transport is a collector
// and "configured" is faked by mutating the env object the mailer re-reads.
test.mock.method(nodemailer, 'createTransport', () => ({
  sendMail: async (message) => {
    if (mailDelayMs) await new Promise((resolve) => setTimeout(resolve, mailDelayMs));
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

test('the recovery mail is a formatted document with the code set apart', async () => {
  fakeConfigured();
  await User.create({
    fullName: 'Recovery Reader', username: 'recoveryreader', email: 'recovery@example.com', password: 'Password123!',
  });

  const response = await request(app).post('/api/auth/forgot-password').send({ email: 'recovery@example.com' });
  assert.equal(response.status, 200);

  const message = outbox[outbox.length - 1];
  assert.equal(message.to, 'recovery@example.com');
  assert.equal(message.subject, 'Your RADAR sign-in code');

  // The plain text part leads with the number - it is the line an inbox prints
  // before the mail is opened, and the whole message on a client that refuses HTML.
  assert.match(message.text, /^Your RADAR sign-in code is \d{6}$/m);
  const code = message.text.match(/code is (\d{6})/)[1];

  assert.ok(message.html.startsWith('<!DOCTYPE html>'), 'a real document, not a loose fragment');
  assert.match(message.html, /Your RADAR sign-in code is \d{6}<\/div>/, 'the preview line carries the code too');
  assert.match(message.html, /Consolas,Menlo,monospace/, 'and the code itself sits in a box of its own');
  assert.ok(message.html.includes(`>${code}</div>`), 'the boxed number is the one the account is waiting for');
  assert.match(message.html, /expires in 10 minutes/);
  assert.match(message.html, /href="[^"]+"[^>]*>RADAR<\/a>/, 'the newsroom name is a button that opens the site');

  // What leaves the server is a code; what stays is only its hash.
  const stored = JSON.stringify(await User.findOne({ email: 'recovery@example.com' }).select('+resetCodeHash +resetCodeExpires').lean());
  assert.ok(!stored.includes(code), 'the account document never holds the readable code');

  // Round trip: the mailed number really does open the door once, and only once.
  const reset = await request(app)
    .post('/api/auth/reset-password')
    .send({ email: 'recovery@example.com', code, password: 'BrandNewPassword1!' });
  assert.equal(reset.status, 200);

  const replay = await request(app)
    .post('/api/auth/reset-password')
    .send({ email: 'recovery@example.com', code, password: 'AnotherPassword1!' });
  assert.equal(replay.status, 400, 'a used code is gone with the password it set');

  const signedIn = await request(app).post('/api/auth/login').send({ email: 'recovery@example.com', password: 'BrandNewPassword1!' });
  assert.equal(signedIn.status, 200);
});

test('a relay that is slow to answer still gets the reader an answer at once', async () => {
  fakeConfigured();
  mailDelayMs = 1500;
  env.MAIL_ANSWER_BUDGET_MS = 150;

  const before = outbox.length;
  const started = Date.now();
  const response = await request(app).post('/api/newsletter/subscribe').send({ email: 'slowrelay@example.com' });
  const waited = Date.now() - started;

  assert.ok(waited < 1200, `the press was answered in ${waited}ms while the relay kept talking`);
  assert.equal(response.status, 200);
  assert.equal(response.body.data.delivered, false, 'nobody is told a mail landed before it has left');
  assert.equal(response.body.data.queued, true, 'and the answer says the mail is on its way');

  const stored = await NewsletterSubscriber.findOne({ email: 'slowrelay@example.com' });
  assert.ok(stored, 'the address is on the list before the relay has had its say');

  await new Promise((resolve) => setTimeout(resolve, mailDelayMs + 400));
  assert.equal(outbox.length, before + 1, 'the confirmation mail went out behind the answer');
});

test.afterEach(() => {
  // Back to the honest off state, so no later test can mail anything even by
  // accident, and the stubbed transport is never pointed at a real host.
  env.SMTP_HOST = '';
  env.SMTP_PORT = 587;
  env.MAIL_FROM_EMAIL = '';
  mailDelayMs = 0;
  env.MAIL_ANSWER_BUDGET_MS = 3000;
});
