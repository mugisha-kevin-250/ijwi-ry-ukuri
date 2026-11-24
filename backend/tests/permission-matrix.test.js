process.env.MONGODB_URI = '';
// The matrix is decided in code, so nothing here may reach a paid API or a mail
// relay, and a stray backend/.env must not be able to make it try.
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
const Comment = require('../src/models/Comment');
const Article = require('../src/models/Article');
const NewsroomAssignment = require('../src/models/NewsroomAssignment');
const AuditLog = require('../src/models/AuditLog');
const Category = require('../src/models/Category');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const { PERMISSIONS, roleCan, isStaffRole } = require('../src/config/permissions');

const PASSWORD = 'Password123!';

/**
 * An account with a given role and a token that opens the staff doors.
 *
 * The role is put on the token the way the login route puts it there, but the
 * answer under test comes from the database row `protect` loads, so a token
 * cannot talk its way into a desk.
 */
async function makeStaff(tag, role) {
  const user = await User.create({
    fullName: `Desk Worker ${tag}`,
    username: `desk${tag}`,
    email: `desk${tag}@example.com`,
    password: await bcrypt.hash(PASSWORD, 10),
    role,
  });
  const token = jwt.sign({ id: user._id, role }, env.JWT_SECRET, { expiresIn: '7d' });
  return { user, token };
}

async function makeComment(tag) {
  const category = await Category.create({ name: `Desk ${tag}`, slug: `matrix-desk-${tag}` });
  const author = await makeStaff(`author${tag}`, 'WRITER');
  const article = await Article.create({
    title: `A story with a comment ${tag}`,
    slug: `story-with-comment-${tag}`,
    summary: 'Short line under the headline.',
    content: 'The body of the story, long enough to be a story.',
    author: author.user._id,
    category: category._id,
    status: 'published',
    publishedAt: new Date(),
  });
  const reader = await makeStaff(`reader${tag}`, 'READER');
  const comment = await Comment.create({ article: article._id, user: reader.user._id, content: 'Can somebody check this?' });
  return { comment, article, reader };
}

test.before(async () => {
  await connectDatabase();
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDatabase();
});

test('the four roles the site shipped with hold what they already did', () => {
  // A writer writes. Anything more than that would be a new power on an old
  // account, which is exactly what this release must not do.
  assert.ok(roleCan('WRITER', PERMISSIONS.writeStories));
  for (const permission of [
    PERMISSIONS.review,
    PERMISSIONS.publish,
    PERMISSIONS.manageUsers,
    PERMISSIONS.manageAds,
    PERMISSIONS.managePayouts,
    PERMISSIONS.managePlatform,
  ]) {
    assert.ok(!roleCan('WRITER', permission), `a WRITER must not hold ${permission}`);
  }

  for (const permission of Object.values(PERMISSIONS)) {
    assert.ok(!roleCan('READER', permission), `a READER holds ${permission}`);
  }

  // The editor desk, as the scattered authorize() calls answered before.
  for (const permission of [
    PERMISSIONS.writeStories,
    PERMISSIONS.publish,
    PERMISSIONS.review,
    PERMISSIONS.correct,
    PERMISSIONS.moderateComments,
    PERMISSIONS.moderateMessages,
    PERMISSIONS.sendPushAlerts,
    PERMISSIONS.viewNewsroomDesk,
    PERMISSIONS.managePayouts,
    PERMISSIONS.manageSettings,
  ]) {
    assert.ok(roleCan('EDITOR', permission), `an EDITOR lost ${permission}`);
  }
  for (const permission of [
    PERMISSIONS.manageUsers,
    PERMISSIONS.manageCategories,
    PERMISSIONS.manageAds,
    PERMISSIONS.manageSeo,
    PERMISSIONS.manageBroadcast,
    PERMISSIONS.runAiWriter,
    PERMISSIONS.managePlatform,
  ]) {
    assert.ok(!roleCan('EDITOR', permission), `an EDITOR gained ${permission}`);
  }

  for (const permission of Object.values(PERMISSIONS)) {
    assert.ok(roleCan('ADMIN', permission), `an ADMIN does not hold ${permission}`);
  }
});

test('a staff role holds its own desk and nothing else', () => {
  const held = (role) => Object.values(PERMISSIONS).filter((permission) => roleCan(role, permission));

  // Nobody but the owner can hand out roles or delete a record outright.
  for (const role of ['MANAGING_EDITOR', 'NEWS_EDITOR', 'SEO_EDITOR', 'SOCIAL_MANAGER', 'AD_MANAGER']) {
    assert.ok(!roleCan(role, PERMISSIONS.manageUsers), `${role} could change who is an admin`);
    assert.ok(!roleCan(role, PERMISSIONS.managePlatform), `${role} could reach the machinery`);
    assert.ok(!roleCan(role, PERMISSIONS.manageSettings), `${role} could rewrite the site settings`);
    assert.ok(!roleCan(role, PERMISSIONS.managePayouts), `${role} could approve a payout`);
    assert.ok(isStaffRole(role), `${role} cannot use a staff door`);
    assert.ok(held(role).length > 0, `${role} holds no permission at all`);
  }

  assert.deepEqual(held('AD_MANAGER'), [PERMISSIONS.manageAds]);
  assert.deepEqual(held('SEO_EDITOR').sort(), [PERMISSIONS.manageCategories, PERMISSIONS.manageSeo].sort());
  for (const permission of [PERMISSIONS.moderateComments, PERMISSIONS.moderateMessages, PERMISSIONS.sendPushAlerts]) {
    assert.ok(roleCan('SOCIAL_MANAGER', permission), `the social desk lost ${permission}`);
  }
  assert.ok(!roleCan('SOCIAL_MANAGER', PERMISSIONS.review), 'the social desk cannot decide what gets published');
  assert.ok(roleCan('NEWS_EDITOR', PERMISSIONS.review));
  assert.ok(!roleCan('NEWS_EDITOR', PERMISSIONS.runAiWriter), 'a news editor is not the owner of the AI writer');
  assert.ok(roleCan('MANAGING_EDITOR', PERMISSIONS.runAiWriter));
});

test('the desks answer the same way for the old roles as before', async () => {
  const reader = await makeStaff('plain', 'READER');
  const writer = await makeStaff('writing', 'WRITER');
  const editor = await makeStaff('editing', 'EDITOR');
  const admin = await makeStaff('admin', 'ADMIN');

  for (const url of ['/api/admin/dashboard', '/api/editor/articles', '/api/admin/ads', '/api/admin/categories']) {
    const anonymous = await request(app).get(url);
    assert.equal(anonymous.status, 401, `${url} answered without a session at all`);
    for (const { token, label } of [
      { token: reader.token, label: 'a reader' },
      { token: writer.token, label: 'a writer' },
    ]) {
      const refused = await request(app).get(url).set('Authorization', `Bearer ${token}`);
      assert.equal(refused.status, 403, `${label} reached ${url}`);
    }
    for (const { token, label } of [
      { token: editor.token, label: 'an editor' },
      { token: admin.token, label: 'an admin' },
    ]) {
      const allowed = await request(app).get(url).set('Authorization', `Bearer ${token}`);
      assert.equal(allowed.status, 200, `${label} was turned away from ${url}`);
    }
  }
});

test('granting a role is the owner desk alone', async () => {
  const admin = await makeStaff('granter', 'ADMIN');
  const editor = await makeStaff('wanting', 'EDITOR');
  const managing = await makeStaff('managing', 'MANAGING_EDITOR');
  const target = await makeStaff('target', 'READER');

  const asEditor = await request(app).put(`/api/admin/users/${target.user._id}`)
    .set('Authorization', `Bearer ${editor.token}`).send({ role: 'NEWS_EDITOR' });
  assert.equal(asEditor.status, 403, 'an editor handed out a staff role');
  assert.equal(asEditor.body.message, 'Your role does not carry the "manageUsers" permission for this action.');

  const asManaging = await request(app).put(`/api/admin/users/${managing.user._id}`)
    .set('Authorization', `Bearer ${managing.token}`).send({ role: 'ADMIN' });
  assert.equal(asManaging.status, 403, 'a managing editor promoted themselves');

  const unknown = await request(app).put(`/api/admin/users/${target.user._id}`)
    .set('Authorization', `Bearer ${admin.token}`).send({ role: 'CHIEF_OF_STAFF' });
  assert.equal(unknown.status, 400, 'a role that is not in the matrix was accepted');

  const asAdmin = await request(app).put(`/api/admin/users/${target.user._id}`)
    .set('Authorization', `Bearer ${admin.token}`).send({ role: 'AD_MANAGER' });
  assert.equal(asAdmin.status, 200);
  assert.equal(asAdmin.body.data.user.role, 'AD_MANAGER');
});

test('the advertising desk belongs to the person who runs it', async () => {
  const adManager = await makeStaff('ads', 'AD_MANAGER');
  const social = await makeStaff('social', 'SOCIAL_MANAGER');
  const editor = await makeStaff('editorial', 'EDITOR');

  // An ad that is refused for what it says proves the request reached the desk;
  // a 403 would prove the guard stopped somebody who runs it.
  const mine = await request(app).post('/api/admin/ads')
    .set('Authorization', `Bearer ${adManager.token}`).send({});
  assert.notEqual(mine.status, 403, 'the ad manager could not reach the ad desk');
  assert.ok([400, 201].includes(mine.status), `the ad desk answered ${mine.status}`);

  const notMine = await request(app).post('/api/admin/ads')
    .set('Authorization', `Bearer ${social.token}`).send({});
  assert.equal(notMine.status, 403, 'the social desk reached the ad desk');

  // The newsroom desk can still read what is running, the way it could before.
  const read = await request(app).get('/api/admin/ads').set('Authorization', `Bearer ${editor.token}`);
  assert.equal(read.status, 200);
  const ownNumbers = await request(app).get('/api/admin/dashboard').set('Authorization', `Bearer ${adManager.token}`);
  assert.equal(ownNumbers.status, 403, 'the ad manager can see the whole newsroom');
});

test('answering a reader is a desk of its own', async () => {
  const { comment } = await makeComment('moderation');
  const social = await makeStaff('social2', 'SOCIAL_MANAGER');
  const ads = await makeStaff('ads2', 'AD_MANAGER');

  const refused = await request(app).put(`/api/editor/comments/${comment._id}/moderate`)
    .set('Authorization', `Bearer ${ads.token}`).send({ action: 'hide' });
  assert.equal(refused.status, 403, 'the ad desk moderated a comment');

  const answered = await request(app).put(`/api/editor/comments/${comment._id}/moderate`)
    .set('Authorization', `Bearer ${social.token}`).send({ action: 'hide', note: 'Checked with the reader.' });
  assert.equal(answered.status, 200, `the social desk could not moderate: ${JSON.stringify(answered.body)}`);
  const after = await Comment.findById(comment._id).lean();
  assert.equal(after.status, 'hidden');
});

test('the section tree is the growth desk, and going on air is not', async () => {
  const seo = await makeStaff('growth', 'SEO_EDITOR');
  const managing = await makeStaff('air', 'MANAGING_EDITOR');
  const ads = await makeStaff('ads3', 'AD_MANAGER');

  const made = await request(app).post('/api/admin/categories')
    .set('Authorization', `Bearer ${seo.token}`).send({ name: 'Growth Desk', slug: 'growth-desk' });
  assert.ok([200, 201].includes(made.status), `the growth desk could not file a section: ${JSON.stringify(made.body)}`);

  const blocked = await request(app).post('/api/admin/categories')
    .set('Authorization', `Bearer ${ads.token}`).send({ name: 'Wrong Desk', slug: 'wrong-desk' });
  assert.equal(blocked.status, 403, 'the ad desk named a section');

  const live = await request(app).post('/api/live')
    .set('Authorization', `Bearer ${managing.token}`).send({ title: 'The evening show', platform: 'internal' });
  assert.notEqual(live.status, 403, 'the managing editor could not go on air');

  const liveByAds = await request(app).post('/api/live')
    .set('Authorization', `Bearer ${ads.token}`).send({ title: 'Not yours', platform: 'internal' });
  assert.equal(liveByAds.status, 403, 'the ad desk went on air');
});

test('a staff role can use the staff door and a writer cannot', async () => {
  const writer = await makeStaff('knocking', 'WRITER');
  await makeStaff('newsroom', 'NEWS_EDITOR');

  const refused = await request(app).post('/api/auth/admin-login')
    .send({ username: 'deskknocking', password: PASSWORD });
  assert.equal(refused.status, 401, 'a writer signed in at the admin door');

  const allowed = await request(app).post('/api/auth/admin-login')
    .send({ username: 'desknewsroom', password: PASSWORD });
  assert.equal(allowed.status, 200, `a news editor was turned away: ${JSON.stringify(allowed.body)}`);
  assert.deepEqual(allowed.body.data.user.permissions, [
    PERMISSIONS.writeStories,
    PERMISSIONS.publish,
    PERMISSIONS.review,
    PERMISSIONS.correct,
    PERMISSIONS.moderateComments,
    PERMISSIONS.moderateMessages,
    PERMISSIONS.sendPushAlerts,
    PERMISSIONS.viewNewsroomDesk,
  ], 'the payload lists what the role holds, in the order the matrix says');
  // The money and the switches stayed with the owner's desk.
  assert.ok(!allowed.body.data.user.permissions.includes(PERMISSIONS.managePayouts));
  assert.ok(!allowed.body.data.user.permissions.includes(PERMISSIONS.manageSettings));
});

test('the signed-in payload carries the permissions rather than a guess', async () => {
  const social = await makeStaff('carrying', 'SOCIAL_MANAGER');
  const mine = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${social.token}`);
  assert.equal(mine.status, 200);
  assert.deepEqual(mine.body.data.user.permissions, [
    PERMISSIONS.moderateComments,
    PERMISSIONS.moderateMessages,
    PERMISSIONS.sendPushAlerts,
  ]);

  // A token that claims a role the account does not hold gets the account's
  // answer, because the server reads the row rather than the claim.
  const forged = jwt.sign({ id: social.user._id, role: 'ADMIN' }, env.JWT_SECRET, { expiresIn: '7d' });
  const claimed = await request(app).get('/api/editor/articles').set('Authorization', `Bearer ${forged}`);
  assert.equal(claimed.status, 403, 'a token printed its way onto the review desk');
});


test('assignment desk enforces reporter ownership and records the workflow', async () => {
  const editor = await makeStaff('assignmenteditor', 'NEWS_EDITOR');
  const writer = await makeStaff('assignmentwriter', 'WRITER');
  const otherWriter = await makeStaff('assignmentother', 'WRITER');
  const reader = await makeStaff('assignmentreader', 'READER');
  const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const created = await request(app).post('/api/assignments')
    .set('Authorization', `Bearer ${editor.token}`)
    .send({
      title: 'Cover the district education meeting',
      brief: 'Interview the organizers, verify the agenda and file a balanced report.',
      desk: 'Education',
      priority: 'high',
      assignedTo: String(writer.user._id),
      dueAt,
    });
  assert.equal(created.status, 201, `editor could not create assignment: ${JSON.stringify(created.body)}`);
  const assignmentId = created.body.data.assignment._id;

  const writerList = await request(app).get('/api/assignments')
    .set('Authorization', `Bearer ${writer.token}`);
  assert.equal(writerList.status, 200);
  assert.equal(writerList.body.data.assignments.length, 1);
  assert.equal(writerList.body.data.assignments[0]._id, assignmentId);

  const otherList = await request(app).get('/api/assignments')
    .set('Authorization', `Bearer ${otherWriter.token}`);
  assert.equal(otherList.status, 200);
  assert.equal(otherList.body.data.assignments.length, 0, 'another writer saw an assignment not assigned to them');

  const readerList = await request(app).get('/api/assignments')
    .set('Authorization', `Bearer ${reader.token}`);
  assert.equal(readerList.status, 403, 'a reader opened the assignments desk');

  const writerCreate = await request(app).post('/api/assignments')
    .set('Authorization', `Bearer ${writer.token}`)
    .send({ title: 'Self-assigned', brief: 'Try to bypass the editor.', assignedTo: String(writer.user._id), dueAt });
  assert.equal(writerCreate.status, 403, 'a writer created an assignment');

  for (const status of ['accepted', 'in_progress', 'submitted']) {
    const changed = await request(app).put(`/api/assignments/${assignmentId}/status`)
      .set('Authorization', `Bearer ${writer.token}`).send({ status });
    assert.equal(changed.status, 200, `writer could not set ${status}: ${JSON.stringify(changed.body)}`);
  }

  const otherUpdate = await request(app).put(`/api/assignments/${assignmentId}/status`)
    .set('Authorization', `Bearer ${otherWriter.token}`).send({ status: 'accepted' });
  assert.equal(otherUpdate.status, 403, 'a different writer updated somebody else’s assignment');

  const approved = await request(app).put(`/api/assignments/${assignmentId}/status`)
    .set('Authorization', `Bearer ${editor.token}`).send({ status: 'approved' });
  assert.equal(approved.status, 200, 'the editor could not approve submitted work');

  const stored = await NewsroomAssignment.findById(assignmentId).lean();
  assert.equal(stored.status, 'approved');
  assert.deepEqual(stored.events.map(item => item.to), ['assigned', 'accepted', 'in_progress', 'submitted', 'approved']);

  const audit = await AuditLog.find({ entityType: 'assignment', entityId: stored._id }).sort({ createdAt: 1 }).lean();
  assert.ok(audit.length >= 2, 'assignment creation and status changes were not written to the audit log');
});
