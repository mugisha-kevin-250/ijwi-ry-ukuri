process.env.MONGODB_URI = '';
// Nothing here may mail anybody or spend a Gemini call, and a stray
// backend/.env must not be able to make it try.
process.env.GEMINI_API_KEY = '';
process.env.SMTP_HOST = '';
process.env.SMTP_PORT = '';
process.env.SMTP_USER = '';
process.env.SMTP_PASSWORD = '';
process.env.MAILJET_API_KEY = '';
process.env.MAILJET_SECRET = '';
process.env.MAIL_FROM_EMAIL = '';
process.env.MAIL_FROM_NAME = '';

const test = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const env = require('../src/config/env');
const nodemailer = require('nodemailer');
const User = require('../src/models/User');
const Category = require('../src/models/Category');
const Article = require('../src/models/Article');
const NewsletterSubscriber = require('../src/models/NewsletterSubscriber');
const mailer = require('../src/services/mailerService');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');

const outbox = [];
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

// The two links in one mail now carry two different tokens, so a test has to
// say which one it means instead of grabbing the first hex string it finds.
function linksIn(message) {
  const all = [...String(message.html || message.text).matchAll(/token=([a-f0-9]{48})/g)].map((m) => m[1]);
  const confirm = String(message.html || '').match(/confirm\?token=([a-f0-9]{48})/);
  const stop = String(message.html || '').match(/unsubscribe\?token=([a-f0-9]{48})/);
  return { all, confirm: confirm && confirm[1], stop: stop && stop[1] };
}

async function makeReader(tag, extra = {}) {
  const user = await User.create({
    fullName: `Alert Reader ${tag}`,
    username: `alertreader${tag}`,
    email: `alertreader${tag}@example.com`,
    password: await bcrypt.hash('Password123!', 10),
    role: 'READER',
    ...extra,
  });
  return { user, token: jwt.sign({ id: user._id, role: 'READER' }, env.JWT_SECRET, { expiresIn: '7d' }) };
}

async function makeDesk(tag, slug) {
  return Category.create({ name: `Desk ${tag}`, slug });
}

async function makeStory(category, title) {
  const author = await User.create({
    fullName: 'Desk Writer', username: `deskwriter${Date.now()}`,
    email: `deskwriter${Date.now()}@example.com`, password: 'x', role: 'WRITER',
  });
  return Article.create({
    title, slug: `${category.slug}-${Date.now()}`, summary: 'What happened.',
    content: 'The story body.', author: author._id, category: category._id,
    status: 'published', publishedAt: new Date(),
  });
}

test.before(async () => {
  await connectDatabase();
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDatabase();
});

test('the choices a reader makes with their address are stored with it', async () => {
  const { token } = await makeReader('choices');
  const response = await request(app)
    .post('/api/newsletter/subscribe')
    .set('Authorization', `Bearer ${token}`)
    .send({
      email: 'choices@example.com',
      sections: ['Sports', ' SPORTS ', 'politics', 'a'.repeat(80), 'not a slug'],
      language: 'RW',
    });

  assert.equal(response.status, 200);
  const subscriber = await NewsletterSubscriber.findOne({ email: 'choices@example.com' });
  assert.deepEqual(subscriber.sections, ['sports', 'politics'], 'duplicated and invented slugs are not kept');
  assert.equal(subscriber.language, 'rw');
  assert.equal(String(subscriber.user), String(jwt.decode(token).id), 'the row knows whose account asked for it');
});

test('the reader screen answers about their own address and nobody else can ask', async () => {
  const mine = await makeReader('mine');
  const theirs = await makeReader('theirs');
  await request(app).post('/api/newsletter/subscribe')
    .set('Authorization', `Bearer ${mine.token}`).send({ email: mine.user.email, sections: ['health'] });

  const anonymous = await request(app).get('/api/newsletter/me');
  assert.equal(anonymous.status, 401);

  const read = await request(app).get('/api/newsletter/me')
    .set('Authorization', `Bearer ${mine.token}`);
  assert.equal(read.status, 200);
  assert.equal(read.body.data.subscription.email, mine.user.email);
  assert.deepEqual(read.body.data.subscription.sections, ['health']);
  assert.ok(read.body.data.languages.includes('rw'));

  // The other account is asked about its own address, and gets an honest
  // nothing rather than the first reader's choices.
  const other = await request(app).get('/api/newsletter/me')
    .set('Authorization', `Bearer ${theirs.token}`);
  assert.equal(other.status, 200);
  assert.equal(other.body.data.subscription, null);
});

test('a reader can change their desks, and stop the mail without hunting for it', async () => {
  fakeConfigured();
  const { user, token } = await makeReader('change');
  await request(app).post('/api/newsletter/subscribe')
    .set('Authorization', `Bearer ${token}`).send({ email: user.email });
  // The reader does what the mail asks and opens the confirmation link.
  const { confirm } = linksIn(outbox[outbox.length - 1]);
  await request(app).get(`/api/newsletter/confirm?token=${confirm}`);
  assert.equal((await NewsletterSubscriber.findOne({ email: user.email })).status, 'confirmed');

  const changed = await request(app).put('/api/newsletter/me')
    .set('Authorization', `Bearer ${token}`)
    .send({ sections: ['sports'], language: 'fr' });
  assert.equal(changed.status, 200);
  assert.deepEqual(changed.body.data.subscription.sections, ['sports']);
  assert.equal(changed.body.data.subscription.language, 'fr');

  const stopped = await request(app).put('/api/newsletter/me')
    .set('Authorization', `Bearer ${token}`).send({ stop: true });
  assert.equal(stopped.status, 200);
  assert.equal(stopped.body.data.subscription.status, 'unsubscribed');

  // Starting them again is a new promise, not a flip of a switch: the reader
  // has to open a mail before anything goes out again.
  const restarted = await request(app).put('/api/newsletter/me')
    .set('Authorization', `Bearer ${token}`).send({ start: true });
  assert.equal(restarted.status, 200);
  assert.equal(restarted.body.data.subscription.status, 'pending');

  const nothing = await request(app).put('/api/newsletter/me')
    .set('Authorization', `Bearer ${token}`).send({ sections: [] });
  assert.equal(nothing.status, 200, 'an empty list is a choice - the whole newsroom');
  assert.deepEqual(nothing.body.data.subscription.sections, []);

  const badLanguage = await request(app).put('/api/newsletter/me')
    .set('Authorization', `Bearer ${token}`).send({ language: 'kl' });
  assert.equal(badLanguage.status, 400);
});

// Desks are chosen by the name a reader sees in the header, which is the parent
// section. A story filed under a sub-desk still belongs to that parent, so it
// has to reach the reader who ticked the parent and never saw the child's name.
test('a story filed under a sub-desk reaches the reader who chose the parent', async () => {
  fakeConfigured();
  const sports = await makeDesk('parent', 'parent-sports');
  const football = await Category.create({ name: 'Football desk', slug: 'child-football', parent: sports._id });

  await NewsletterSubscriber.create({ email: 'parent-chosen@example.com', status: 'confirmed', sections: ['parent-sports'] });
  await NewsletterSubscriber.create({ email: 'child-only@example.com', status: 'confirmed', sections: ['child-football'] });

  const before = outbox.length;
  const result = await mailer.announceStory(await makeStory(football, 'A football match was played'));
  assert.equal(result.section, 'child-football', 'the story is still filed where the newsroom put it');
  assert.equal(result.total, 2, 'both the parent reader and the child reader are on this story');

  const recipients = outbox.slice(before).map((mail) => mail.to);
  assert.ok(recipients.includes('parent-chosen@example.com'), 'the parent choice covers its children');
  assert.ok(recipients.includes('child-only@example.com'));

  const elsewhere = await mailer.announceStory(await makeStory(await makeDesk('parent2', 'parent-politics'), 'A politics story'));
  assert.equal(elsewhere.total, 0, 'a desk nobody chose reaches only readers who chose nothing');
});

test('a desk a reader did not choose is a story they are not mailed', async () => {
  fakeConfigured();
  const sports = await makeDesk('prefs-sports', 'sports-prefs');
  const world = await makeDesk('prefs-world', 'world-prefs');

  await NewsletterSubscriber.create({ email: 'sportsonly@example.com', status: 'confirmed', sections: ['sports-prefs'] });
  await NewsletterSubscriber.create({ email: 'everything@example.com', status: 'confirmed' });

  const before = outbox.length;
  const football = await mailer.announceStory(await makeStory(sports, 'A match was played'));
  assert.equal(football.total, 2, 'the unchosen desk is only filtered for readers who chose');
  assert.equal(football.section, 'sports-prefs');
  assert.equal(outbox.length, before + 2);

  const abroad = await mailer.announceStory(await makeStory(world, 'Something happened elsewhere'));
  assert.equal(abroad.total, 1, 'the reader who asked for sport only is not mailed the world desk');
  assert.equal(abroad.sent, 1);
  const to = outbox.slice(-1)[0].to;
  assert.equal(to, 'everything@example.com');
});

test('a reader who asked for alerts in Kinyarwanda is mailed in Kinyarwanda', async () => {
  fakeConfigured();
  const desk = await makeDesk('rw', 'rwanda-desk');
  await NewsletterSubscriber.create({
    email: 'kinyarwanda@example.com', status: 'confirmed', language: 'rw', sections: ['rwanda-desk'],
  });

  const before = outbox.length;
  await mailer.announceStory(await makeStory(desk, 'Inkuru y’umupira'));
  // Readers who chose nothing are mailed every desk, so the Kinyarwanda
  // address is not simply the next mail out of the box.
  const message = outbox.slice(before).find((mail) => mail.to === 'kinyarwanda@example.com');
  assert.ok(message, 'the reader who asked for this desk was mailed');
  assert.match(message.html, /Hagarika izi nkuru/, 'the stop line is in the language they chose');
  assert.match(message.html, /Soma inkuru/, 'and so is the button');
  assert.ok(!/Stop these alerts/.test(message.html), 'the English sentence is not left in behind it');
  // The headline and the summary are the newsroom's, and are not rewritten.
  assert.match(message.html, /Inkuru y’umupira/);
});

test('the stop link is its own link, in the header as well as the mail', async () => {
  fakeConfigured();
  const email = 'header@example.com';
  const subscribe = await request(app).post('/api/newsletter/subscribe').send({ email });
  assert.equal(subscribe.status, 200);

  const confirmation = outbox[outbox.length - 1];
  const { confirm, stop, all } = linksIn(confirmation);
  assert.ok(confirm && stop, 'both links were printed');
  assert.notEqual(confirm, stop, 'and they are not the same credential');

  // The header is what a mail client's own unsubscribe button reads.
  assert.match(
    confirmation.headers['List-Unsubscribe'],
    new RegExp(`^<.*\\/unsubscribe\\?token=${stop}>$`),
    'the header carries the same stop link printed in the mail',
  );
  assert.equal(confirmation.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');

  // A confirmation token cannot be used to unsubscribe, or the other way round.
  const offWithConfirmToken = await request(app).post('/api/newsletter/unsubscribe').send({ token: confirm });
  assert.equal(offWithConfirmToken.status, 400, 'the confirm link is not an unsubscribe link');
  const onWithStopToken = await request(app).get(`/api/newsletter/confirm?token=${stop}`);
  assert.match(onWithStopToken.text, /no longer works/, 'and the stop link is not a confirmation');

  const reader = await NewsletterSubscriber.findOne({ email });
  assert.equal(reader.status, 'pending', 'so nothing about the subscription has moved');

  // The newest mail's own stop link works, and stops.
  const unsubscribed = await request(app).post('/api/newsletter/unsubscribe').send({ token: stop });
  assert.equal(unsubscribed.status, 200);
  assert.equal((await NewsletterSubscriber.findOne({ email })).status, 'unsubscribed');
});

test('the story alert carries the same one-click header', async () => {
  fakeConfigured();
  const desk = await makeDesk('header', 'header-desk');
  await NewsletterSubscriber.create({ email: 'alert-header@example.com', status: 'confirmed' });
  const before = outbox.length;
  await mailer.announceStory(await makeStory(desk, 'A story with a header'));

  const message = outbox[before];
  const { stop } = linksIn(message);
  assert.match(message.headers['List-Unsubscribe'], /unsubscribe\?token=/);
  assert.equal(message.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.ok(stop, 'and the same URL is printed for a human to click');
});

test('raw tokens never leave the database', async () => {
  fakeConfigured();
  const email = 'hashed@example.com';
  await request(app).post('/api/newsletter/subscribe').send({ email });
  const message = outbox[outbox.length - 1];
  const { confirm, stop } = linksIn(message);
  const stored = JSON.stringify(await NewsletterSubscriber.findOne({ email }).lean());
  assert.ok(!stored.includes(confirm) && !stored.includes(stop), 'only the hashes are kept');
});
