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
const User = require('../src/models/User');
const Article = require('../src/models/Article');
const WriterProfile = require('../src/models/WriterProfile');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');

let token;
let editorToken;
let ownerToken;
let articleId;
let articleSlug;
let payoutId;
let contactId;

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

test('a writer cannot edit the fields that decide pay or review', async () => {
  const response = await request(app)
    .put(`/api/writers/articles/${articleId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ summary: 'A summary the writer is allowed to change', validViews: 999999, status: 'published', aiGenerated: true, author: articleId });

  assert.equal(response.status, 200);
  assert.equal(response.body.data.article.validViews, 0);
  assert.equal(response.body.data.article.status, 'draft');
  assert.equal(response.body.data.article.aiGenerated, false);
  // Rewriting who wrote the story is refused too, while a real field saves.
  assert.notEqual(String(response.body.data.article.author), String(articleId));
  assert.equal(response.body.data.article.summary, 'A summary the writer is allowed to change');
});

test('a stored story keeps only text a reader can safely see', async () => {
  const categoryResponse = await request(app).get('/api/categories');
  const categoryId = categoryResponse.body.data.categories[0]._id;

  const response = await request(app)
    .post('/api/writers/articles')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: 'Fake <b>Headline</b> \u202egnaildeahC',
      summary: '  Extra   spaces\n\n\n\n and a long   tail  ',
      content: '<p>Body</p>',
      category: categoryId,
      tags: ['#News', 'news', '  ', 'RWANDA', 'a'.repeat(80)],
      featuredImage: 'javascript:alert(1)'
    });

  assert.equal(response.status, 201);
  const story = response.body.data.article;
  assert.equal(story.title, 'Fake Headline gnaildeahC');
  assert.equal(story.summary, story.summary.trim());
  assert.ok(!/\n{3,}/.test(story.summary));
  assert.ok(!story.summary.includes('   '));
  // The body keeps its markup: paragraphs are how a story is written.
  assert.equal(story.content, '<p>Body</p>');
  assert.deepEqual(story.tags, ['news', 'rwanda', 'a'.repeat(40)]);
  assert.equal(story.featuredImage, '');

  const blank = await request(app)
    .post('/api/writers/articles')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: '<b></b>', summary: 'A real summary', content: 'Real body text', category: categoryId });
  assert.equal(blank.status, 400);

  const blankComment = await request(app)
    .post(`/api/articles/${articleId}/comments`)
    .set('Authorization', `Bearer ${token}`)
    .send({ content: '   \n  ' });
  assert.equal(blankComment.status, 400);
});

test('writer publishes their own article', async () => {
  const response = await request(app)
    .post(`/api/writers/articles/${articleId}/publish`)
    .set('Authorization', `Bearer ${token}`);

  assert.equal(response.status, 200);
});

test('search reads what a reader typed as plain words', async () => {
  const found = await request(app).get('/api/search?search=First');
  assert.equal(found.status, 200);
  assert.ok(found.body.data.articles.some((item) => item.title === 'My First Story'));

  // Typed straight into a RegExp, "(" threw and the reader got a 500 instead of
  // an empty result list; a stray "+" used to match the whole archive.
  for (const term of ['(', 'a+', '[a-z]*']) {
    const response = await request(app).get(`/api/search?search=${encodeURIComponent(term)}`);
    assert.equal(response.status, 200);
    assert.equal(response.body.data.articles.length, 0, `"${term}" was treated as a pattern`);
  }

  const list = await request(app).get(`/api/articles?search=${encodeURIComponent('(Story')}`);
  assert.equal(list.status, 200);
  assert.equal(list.body.data.articles.length, 0);
});

test('article approval and publish', async () => {
  const adminUser = await request(app).post('/api/auth/register').send({ fullName: 'Admin User', username: 'admin1', email: 'admin@example.com', password: 'Password123!' });
  const admin = await mongoose.connection.collection('users').findOne({ email: 'admin@example.com' });
  await mongoose.connection.collection('users').updateOne({ _id: admin._id }, { $set: { role: 'ADMIN' } });
  editorToken = jwtTokenFor(admin._id, 'ADMIN');

  // This desk only ever sees stories an author handed over, so the test submits
  // its own rather than reusing the one the writer already put on the site.
  const category = await Category.findOne({ slug: 'general' });
  const created = await request(app)
    .post('/api/writers/articles')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Story For Review', summary: 'A summary', content: 'Full body text for the review desk', category: category._id });
  assert.equal(created.status, 201);
  const reviewId = created.body.data.article._id;

  const submitted = await request(app)
    .post(`/api/writers/articles/${reviewId}/submit`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(submitted.status, 200);

  const approveResponse = await request(app)
    .put(`/api/editor/articles/${reviewId}/approve`)
    .set('Authorization', `Bearer ${editorToken}`);

  assert.equal(approveResponse.status, 200);

  const publishResponse = await request(app)
    .put(`/api/editor/articles/${reviewId}/publish`)
    .set('Authorization', `Bearer ${editorToken}`);

  assert.equal(publishResponse.status, 200);
});

// An author who has not been looked at yet can pull their story out of the
// queue; once an editor signs it, the desk owns it and the take-back is refused.
test('an author takes a story back only while nobody has reviewed it', async () => {
  const category = await Category.findOne({ slug: 'general' });
  const created = await request(app)
    .post('/api/writers/articles')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Story To Withdraw', summary: 'A summary', content: 'Body text that will be pulled back', category: category._id });
  const withdrawId = created.body.data.article._id;

  await request(app).post(`/api/writers/articles/${withdrawId}/submit`).set('Authorization', `Bearer ${token}`);

  const takenBack = await request(app)
    .post(`/api/writers/articles/${withdrawId}/unpublish`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(takenBack.status, 200);
  assert.equal(takenBack.body.data.article.status, 'draft');

  await request(app).post(`/api/writers/articles/${withdrawId}/submit`).set('Authorization', `Bearer ${token}`);
  await request(app).put(`/api/editor/articles/${withdrawId}/approve`).set('Authorization', `Bearer ${editorToken}`);

  const refused = await request(app)
    .post(`/api/writers/articles/${withdrawId}/unpublish`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(refused.status, 409);
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

test('the reader library reads the same shelf the reader page shows', async () => {
  const category = await Category.findOne({ slug: 'general' }).select('_id').lean();
  const author = await User.create({
    fullName: 'Shelf Author', username: 'shelfauthor', email: 'shelf@example.com', password: 'Password123!', role: 'WRITER',
  });
  const profile = await WriterProfile.create({
    user: author._id, fullName: 'Shelf Author', username: 'shelfauthor', status: 'approved',
  });
  const takenDown = await Article.create({
    title: 'Taken down story', slug: `taken-${Date.now()}`, summary: 'Archived.', content: 'Body text.',
    author: author._id, category: category._id, status: 'archived',
  });

  await request(app).post(`/api/articles/${articleId}/bookmark`).set('Authorization', `Bearer ${token}`);
  await request(app).post(`/api/articles/${takenDown._id}/bookmark`).set('Authorization', `Bearer ${token}`);
  const follow = await request(app).post(`/api/writers/${profile._id}/follow`).set('Authorization', `Bearer ${token}`);
  assert.equal(follow.status, 201);

  const bookmarks = await request(app).get('/api/users/me/bookmarks').set('Authorization', `Bearer ${token}`);
  assert.equal(bookmarks.status, 200);
  // A story that was taken down stays off the shelf but is still counted, so
  // nothing the reader saved disappears without a word.
  const savedIds = bookmarks.body.data.bookmarks.map((row) => String(row.article._id));
  assert.ok(savedIds.includes(String(articleId)));
  assert.ok(!savedIds.includes(String(takenDown._id)));
  assert.equal(bookmarks.body.data.unavailable, 1);

  const following = await request(app).get('/api/users/me/following').set('Authorization', `Bearer ${token}`);
  assert.equal(following.status, 200);
  assert.ok(following.body.data.follows.some((row) => String(row.writer.user._id) === String(author._id)));

  const ranked = await request(app).get('/api/writers/top').query({ limit: 6 });
  assert.equal(ranked.status, 200);
  const counted = ranked.body.data.writers.find((writer) => writer.username === 'shelfauthor');
  assert.equal(counted.followers, 1);
  // The shelf links to the account page, so it hands back the account id.
  assert.equal(String(counted._id), String(author._id));

  const drop = await request(app).delete(`/api/articles/${articleId}/bookmark`).set('Authorization', `Bearer ${token}`);
  assert.equal(drop.status, 200);
  const unfollow = await request(app).delete(`/api/writers/${profile._id}/follow`).set('Authorization', `Bearer ${token}`);
  assert.equal(unfollow.status, 200);
});

test('a reported comment waits for a human and only staff can take it away', async () => {
  const before = await Article.findById(articleId).select('commentsCount').lean();
  const posted = await request(app)
    .post(`/api/articles/${articleId}/comments`)
    .set('Authorization', `Bearer ${token}`)
    .send({ content: 'A comment that needs a second look' });
  assert.equal(posted.status, 201);
  const commentId = posted.body.data.comment._id;

  // The thread's counter is recounted from the rows, so it cannot drift upward
  // forever the way a plain increment does once anything is taken down.
  const afterPost = await Article.findById(articleId).select('commentsCount').lean();
  assert.equal(afterPost.commentsCount, Number(before.commentsCount || 0) + 1);

  const forbidden = await request(app)
    .get('/api/editor/comments')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(forbidden.status, 403);

  // Reporting is only a request that a human look, so the words stay readable.
  const reported = await request(app)
    .post(`/api/articles/comments/${commentId}/report`)
    .set('Authorization', `Bearer ${token}`)
    .send({ reason: 'Feels like an advertisement' });
  assert.equal(reported.status, 200);
  assert.equal(reported.body.data.comment.status, 'reported');

  const readable = await request(app).get(`/api/articles/${articleId}/comments`);
  assert.equal(readable.status, 200);
  const visible = readable.body.data.comments.find((row) => String(row._id) === String(commentId));
  assert.ok(visible, 'a reported comment disappeared from readers');
  // The reader who flagged it learns that they did; nobody learns who flagged it.
  const asFlagger = await request(app)
    .get(`/api/articles/${articleId}/comments`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(asFlagger.body.data.comments.find((row) => String(row._id) === String(commentId)).reported, true);
  assert.equal(visible.reported, false);
  assert.equal(visible.reportedBy, undefined);

  const queue = await request(app)
    .get('/api/editor/comments')
    .query({ status: 'reported' })
    .set('Authorization', `Bearer ${editorToken}`);
  assert.equal(queue.status, 200);
  const queued = queue.body.data.comments.find((row) => String(row._id) === String(commentId));
  assert.equal(queued.reports, 1);
  assert.equal(queued.reportedBy, undefined);
  assert.equal(queued.reportReason, 'Feels like an advertisement');

  const hidden = await request(app)
    .put(`/api/editor/comments/${commentId}/moderate`)
    .set('Authorization', `Bearer ${editorToken}`)
    .send({ action: 'hide', note: 'Promotional link' });
  assert.equal(hidden.status, 200);
  assert.equal(hidden.body.data.comment.status, 'hidden');
  assert.ok(hidden.body.data.comment.moderatedBy, 'the takedown recorded nobody');
  assert.equal(hidden.body.data.comment.moderationNote, 'Promotional link');

  const afterHide = await request(app).get(`/api/articles/${articleId}/comments`);
  assert.ok(!afterHide.body.data.comments.some((row) => String(row._id) === String(commentId)));
  const afterHideStory = await Article.findById(articleId).select('commentsCount').lean();
  assert.equal(afterHideStory.commentsCount, Number(before.commentsCount || 0));

  const restored = await request(app)
    .put(`/api/editor/comments/${commentId}/moderate`)
    .set('Authorization', `Bearer ${editorToken}`)
    .send({ action: 'restore' });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.data.comment.status, 'active');
  const back = await request(app).get(`/api/articles/${articleId}/comments`);
  assert.ok(back.body.data.comments.some((row) => String(row._id) === String(commentId)));

  const nonsense = await request(app)
    .put(`/api/editor/comments/${commentId}/moderate`)
    .set('Authorization', `Bearer ${editorToken}`)
    .send({ action: 'erase' });
  assert.equal(nonsense.status, 400);
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

test('a reader reaches the newsroom through the contact form', async () => {
  const sent = await request(app)
    .post('/api/contact')
    .send({
      name: 'Alice Reader',
      email: 'alice@example.com',
      topic: 'correction',
      message: 'The council budget figure in story 14 is one billion short of the published document.'
    });

  assert.equal(sent.status, 201);
  assert.equal(sent.body.success, true);

  const inbox = await request(app)
    .get('/api/admin/contact-messages')
    .set('Authorization', `Bearer ${ownerToken}`);

  assert.equal(inbox.status, 200);
  const mine = inbox.body.data.messages.find((item) => item.email === 'alice@example.com');
  assert.ok(mine, 'the message the reader sent is in the newsroom inbox');
  assert.equal(mine.topic, 'correction');
  assert.equal(mine.status, 'open');
  assert.ok(inbox.body.data.openCount >= 1);
  contactId = mine._id;

  const closed = await request(app)
    .get('/api/admin/contact-messages')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(closed.status, 403);
});

test('the contact form refuses what a reply would fail on', async () => {
  const noAddress = await request(app)
    .post('/api/contact')
    .send({ name: 'Alice Reader', email: 'not-an-address', topic: 'other', message: 'A long enough message to be worth reading by the newsroom.' });
  assert.equal(noAddress.status, 400);

  const tooShort = await request(app)
    .post('/api/contact')
    .send({ name: 'Alice Reader', email: 'alice@example.com', topic: 'other', message: 'hi' });
  assert.equal(tooShort.status, 400);

  const noName = await request(app)
    .post('/api/contact')
    .send({ email: 'alice@example.com', topic: 'other', message: 'A long enough message to be worth reading by the newsroom.' });
  assert.equal(noName.status, 400);
});

test('a bot that fills the hidden field is thanked and stores nothing', async () => {
  const before = await request(app)
    .get('/api/admin/contact-messages')
    .set('Authorization', `Bearer ${ownerToken}`);

  const spider = await request(app)
    .post('/api/contact')
    .send({
      name: 'Cheap Watches',
      email: 'spam@example.com',
      topic: 'advertising',
      message: 'Buy our products today, this is long enough to pass every other check the form makes.',
      website: 'http://cheap-watches.example.com'
    });

  // The same answer a real reader gets, so the crawler cannot learn which field gave it away.
  assert.equal(spider.status, 201);

  const after = await request(app)
    .get('/api/admin/contact-messages')
    .set('Authorization', `Bearer ${ownerToken}`);

  assert.equal(after.body.data.total, before.body.data.total);
  assert.ok(!after.body.data.messages.some((item) => item.email === 'spam@example.com'));
});

test('staff mark a message answered and only the owner can delete it', async () => {
  const answered = await request(app)
    .put(`/api/admin/contact-messages/${contactId}/status`)
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ status: 'answered' });

  assert.equal(answered.status, 200);
  assert.equal(answered.body.data.message.status, 'answered');
  assert.ok(answered.body.data.message.handledBy, 'who answered it is recorded');

  const rejected = await request(app)
    .put(`/api/admin/contact-messages/${contactId}/status`)
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ status: 'filed-under-mattress' });
  assert.equal(rejected.status, 400);

  const readerDelete = await request(app)
    .delete(`/api/admin/contact-messages/${contactId}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(readerDelete.status, 403);

  const ownerDelete = await request(app)
    .delete(`/api/admin/contact-messages/${contactId}`)
    .set('Authorization', `Bearer ${ownerToken}`);
  assert.equal(ownerDelete.status, 200);
});
