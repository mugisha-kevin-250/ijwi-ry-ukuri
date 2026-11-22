process.env.MONGODB_URI = '';
// Nothing in this file may reach a paid API or a mail relay, and a stray
// backend/.env must not be able to make it try.
process.env.GEMINI_API_KEY = '';
process.env.SMTP_HOST = '';
process.env.SMTP_USER = '';
process.env.SMTP_PASSWORD = '';
process.env.MAILJET_API_KEY = '';
process.env.MAILJET_SECRET = '';
process.env.MAIL_FROM_EMAIL = '';

const test = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const env = require('../src/config/env');
const User = require('../src/models/User');
const Category = require('../src/models/Category');
const Article = require('../src/models/Article');
const Comment = require('../src/models/Comment');
const Like = require('../src/models/Like');
const Bookmark = require('../src/models/Bookmark');
const Follow = require('../src/models/Follow');
const Notification = require('../src/models/Notification');
const PushSubscription = require('../src/models/PushSubscription');
const ArticleView = require('../src/models/ArticleView');
const AiResearchChat = require('../src/models/AiResearchChat');
const Report = require('../src/models/Report');
const ContactMessage = require('../src/models/ContactMessage');
const NewsletterSubscriber = require('../src/models/NewsletterSubscriber');
const WriterProfile = require('../src/models/WriterProfile');
const WriterEarning = require('../src/models/WriterEarning');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');

const PASSWORD = 'Password123!';

// The User model stores whatever it is handed - hashing is the register route's
// job - so a fixture that wants a real login has to do the same thing.
async function makeUser(tag, role = 'READER') {
  const user = await User.create({
    fullName: `Person ${tag}`,
    username: `person${tag}`,
    email: `person${tag}@example.com`,
    password: await bcrypt.hash(PASSWORD, 10),
    role,
  });
  return { user, token: jwt.sign({ id: user._id, role }, env.JWT_SECRET, { expiresIn: '7d' }) };
}

/** A published story and the writer whose byline is on it. */
async function makeStory(tag) {
  const { user } = await makeUser(`writer${tag}`, 'WRITER');
  const category = await Category.create({ name: `Desk ${tag}`, slug: `desk-${tag}` });
  const article = await Article.create({
    title: `A story somebody read ${tag}`,
    slug: `story-somebody-read-${tag}`,
    summary: 'Short line under the headline.',
    content: 'The body of the story, long enough to be a story.',
    author: user._id,
    category: category._id,
    status: 'published',
    publishedAt: new Date(),
  });
  return { writer: user, article, category };
}

test.before(async () => {
  await connectDatabase();
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDatabase();
});

test('closing an account is not something a stranger can press', async () => {
  const { user, token } = await makeUser('guarded');

  const anonymous = await request(app).delete('/api/users/me');
  assert.equal(anonymous.status, 401);

  const noPassword = await request(app).delete('/api/users/me')
    .set('Authorization', `Bearer ${token}`).send({ confirm: true });
  assert.equal(noPassword.status, 400);
  assert.match(noPassword.body.message, /password/i);

  const noConfirmation = await request(app).delete('/api/users/me')
    .set('Authorization', `Bearer ${token}`).send({ password: PASSWORD });
  assert.equal(noConfirmation.status, 400);
  assert.match(noConfirmation.body.message, /for good/i);

  const wrongPassword = await request(app).delete('/api/users/me')
    .set('Authorization', `Bearer ${token}`).send({ password: 'NotThePassword', confirm: true });
  assert.equal(wrongPassword.status, 401);

  assert.ok(await User.findById(user._id), 'a refused attempt leaves the account exactly as it was');
});

test('a reader who closes their account leaves nothing that names them', async () => {
  const story = await makeStory('clean');
  const { user, token } = await makeUser('clean');
  const other = await makeUser('other');

  await Comment.create({ article: story.article._id, user: user._id, content: 'My own words.' });
  await Comment.create({
    article: story.article._id,
    user: other.user._id,
    content: 'Somebody else is still here.',
    reportedBy: [user._id],
  });
  await Like.create({ article: story.article._id, user: user._id });
  await Like.create({ article: story.article._id, user: other.user._id });
  await Bookmark.create({ article: story.article._id, user: user._id });
  await Follow.create({ follower: user._id, writer: (await WriterProfile.create({
    user: story.writer._id, fullName: story.writer.fullName, username: story.writer.username,
  }))._id });
  await Notification.create({ user: user._id, type: 'system', message: 'Something happened.' });
  await PushSubscription.create({
    endpoint: 'https://push.example/abc', p256dh: 'key', auth: 'secret', user: user._id,
  });
  await AiResearchChat.create({ owner: user._id, turns: [] });
  await Report.create({ article: story.article._id, reporter: user._id, reason: 'spam' });
  await ContactMessage.create({
    name: user.fullName, email: user.email, message: 'A question the newsroom was sent.',
  });
  await NewsletterSubscriber.create({ email: user.email, status: 'confirmed' });
  await ArticleView.create({ articleId: story.article._id, readerId: user._id, hashedIp: 'abc123' });

  const closed = await request(app).delete('/api/users/me')
    .set('Authorization', `Bearer ${token}`).send({ password: PASSWORD, confirm: true });

  assert.equal(closed.status, 200);
  assert.equal(closed.body.data.removed.comments, 1);
  assert.equal(closed.body.data.removed.likes, 1);
  assert.equal(closed.body.data.removed.bookmarks, 1);
  assert.equal(closed.body.data.removed.follows, 1);
  assert.equal(closed.body.data.removed.reports, 1);
  assert.equal(closed.body.data.removed.contactMessages, 1);
  assert.equal(closed.body.data.removed.mailSubscriptions, 1);
  assert.equal(closed.body.data.removed.account, 1);

  assert.equal(await User.countDocuments({ _id: user._id }), 0);
  assert.equal(await Comment.countDocuments({ user: user._id }), 0);
  assert.equal(await Like.countDocuments({ user: user._id }), 0);
  assert.equal(await Bookmark.countDocuments({ user: user._id }), 0);
  assert.equal(await Notification.countDocuments({ user: user._id }), 0);
  assert.equal(await PushSubscription.countDocuments({ user: user._id }), 0);
  assert.equal(await AiResearchChat.countDocuments({ owner: user._id }), 0);
  assert.equal(await Report.countDocuments({ reporter: user._id }), 0);
  assert.equal(await ContactMessage.countDocuments({ email: user.email }), 0);
  assert.equal(await NewsletterSubscriber.countDocuments({ email: user.email }), 0);

  // The address is gone from the mail list, so a story alert cannot reach a
  // person who no longer exists here.
  const stillHeresComment = await Comment.findOne({ user: other.user._id });
  assert.ok(stillHeresComment, 'another reader keeps their comment');
  assert.ok(!(stillHeresComment.reportedBy || []).some((id) => String(id) === String(user._id)),
    'the closed account is pulled off the report it filed, but the report itself survives');

  // The story is the newsroom's, and its counters are recounted from the rows
  // that are left rather than left claiming a reader who is gone.
  const storyAfter = await Article.findById(story.article._id);
  assert.equal(storyAfter.likes, 1, 'the like the other reader gave is the only one left');
  assert.equal(storyAfter.commentsCount, 1);

  // A view is a number on somebody's story, not a personal document: the row
  // stays so the story keeps its honest count, and the person leaves it.
  const views = await ArticleView.find({ articleId: story.article._id });
  assert.equal(views.length, 1, 'the reading is still counted');
  assert.equal(views[0].readerId, null, 'but it no longer belongs to anybody');
});

test('a byline that has run is not erased with the person who wrote it', async () => {
  const story = await makeStory('byline');
  const token = jwt.sign({ id: story.writer._id, role: 'WRITER' }, env.JWT_SECRET, { expiresIn: '7d' });

  await Like.create({ article: story.article._id, user: story.writer._id });

  const refused = await request(app).delete('/api/users/me')
    .set('Authorization', `Bearer ${token}`).send({ password: PASSWORD, confirm: true });

  assert.equal(refused.status, 409);
  assert.match(refused.body.message, /byline|record/i);

  assert.ok(await User.findById(story.writer._id), 'the account is untouched by a refusal');
  assert.ok(await Article.findById(story.article._id), 'the story is untouched by a refusal');
  assert.equal(await Like.countDocuments({ user: story.writer._id }), 1);
});

test('a newsroom account cannot be closed from the reader screen', async () => {
  const staff = await makeUser('staff', 'ADMIN');

  const refused = await request(app).delete('/api/users/me')
    .set('Authorization', `Bearer ${staff.token}`).send({ password: PASSWORD, confirm: true });

  assert.equal(refused.status, 409);
  assert.match(refused.body.message, /desk can close/i);
  assert.ok(await User.findById(staff.user._id));
});

test('an author page with earnings is business record, not personal data', async () => {
  const { user, token } = await makeUser('paid', 'WRITER');
  const profile = await WriterProfile.create({ user: user._id, fullName: user.fullName, username: user.username });
  const weekStart = new Date(Date.UTC(2026, 10, 16));
  await WriterEarning.create({
    writerId: user._id, weekStart, weekEnd: new Date(Date.UTC(2026, 10, 22)),
    validViews: 120, calculatedAmount: 420, approvedAmount: 420, status: 'approved',
  });
  await Follow.create({ follower: (await makeUser('fan')).user._id, writer: profile._id });

  const refused = await request(app).delete('/api/users/me')
    .set('Authorization', `Bearer ${token}`).send({ password: PASSWORD, confirm: true });

  assert.equal(refused.status, 409);
  assert.match(refused.body.message, /payment|follows/i);
  assert.equal(await WriterEarning.countDocuments({ writerId: user._id }), 1);
});

test('someone who applied to write but never published can still leave', async () => {
  const { user, token } = await makeUser('applicant', 'WRITER');
  await WriterProfile.create({ user: user._id, fullName: user.fullName, username: user.username });
  await Bookmark.create({ article: (await makeStory('applicant-story')).article._id, user: user._id });

  const closed = await request(app).delete('/api/users/me')
    .set('Authorization', `Bearer ${token}`).send({ password: PASSWORD, confirm: true });

  assert.equal(closed.status, 200);
  assert.equal(closed.body.data.removed.writerProfile, 1);
  assert.equal(await WriterProfile.countDocuments({ user: user._id }), 0);
  assert.equal(await User.countDocuments({ _id: user._id }), 0);
});
