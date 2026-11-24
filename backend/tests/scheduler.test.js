process.env.MONGODB_URI = '';

const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const Article = require('../src/models/Article');
const Category = require('../src/models/Category');
const SchedulerRun = require('../src/models/SchedulerRun');
const scheduler = require('../src/jobs/scheduler');
const schedulerLog = require('../src/services/schedulerLog');
const schedulerLock = require('../src/services/schedulerLock');
const SchedulerLock = require('../src/models/SchedulerLock');
const liveScoreService = require('../src/services/liveScoreService');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');

let adminToken;
let editorToken;
let categoryId;

test.before(async () => {
  await connectDatabase();
  await Category.create({ name: 'General', slug: 'general', description: 'Test category', isActive: true });
  categoryId = (await Category.findOne({ slug: 'general' }))._id;

  // Roles are moved in the database and the token comes from a real sign-up,
  // because the desk reads the role off the account every request - which is
  // the behaviour a permission test is supposed to prove.
  const admin = await request(app).post('/api/auth/register').send({
    fullName: 'Clock Owner', username: 'clockowner', email: 'clockowner@example.com', password: 'Password123!',
  });
  await mongoose.connection.collection('users').updateOne(
    { email: 'clockowner@example.com' },
    { $set: { role: 'ADMIN' } },
  );
  adminToken = admin.body.data.token;

  const editor = await request(app).post('/api/auth/register').send({
    fullName: 'Clock Editor', username: 'clockeditor', email: 'clockeditor@example.com', password: 'Password123!',
  });
  await mongoose.connection.collection('users').updateOne(
    { email: 'clockeditor@example.com' },
    { $set: { role: 'EDITOR' } },
  );
  editorToken = editor.body.data.token;
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDatabase();
});

async function timedStory(title) {
  const owner = await mongoose.connection.collection('users').findOne({ email: 'clockowner@example.com' });
  return Article.create({
    title,
    slug: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
    summary: 'A short summary of the story.',
    content: 'One two three four five six seven eight nine ten words of body text.',
    author: owner._id,
    category: categoryId,
    status: 'approved',
    scheduledAt: new Date(Date.now() - 60 * 1000),
  });
}

test('MongoDB scheduler leases prevent cross-instance overlap and recover expired owners', async () => {
  await SchedulerLock.deleteMany({ job: 'lease-test' });
  const first = await schedulerLock.acquire('lease-test');
  assert.ok(first?.owner, 'the first process claims the job');

  const competing = await schedulerLock.acquire('lease-test');
  assert.equal(competing, null, 'a second process cannot claim an active lease');

  assert.equal(await schedulerLock.renew(first), true, 'the owner can extend its own lease');
  await SchedulerLock.updateOne(
    { job: 'lease-test', owner: first.owner },
    { $set: { leaseUntil: new Date(Date.now() - 1000) } },
  );

  const recovered = await schedulerLock.acquire('lease-test');
  assert.ok(recovered?.owner);
  assert.notEqual(recovered.owner, first.owner, 'an expired lease can be recovered');
  assert.equal(await schedulerLock.release(first), false, 'an old owner cannot release a new owner lease');
  assert.equal(await schedulerLock.release(recovered), true);
});

test('the scheduler desk lists its jobs and says whether the clock is running here', async () => {
  const response = await request(app)
    .get('/api/admin/scheduler/runs')
    .set('Authorization', `Bearer ${adminToken}`);

  assert.equal(response.status, 200);
  const names = response.body.data.jobs.map((job) => job.name);
  assert.deepEqual(
    names.sort(),
    ['breaking', 'global-news', 'publish', 'radio', 'scores', 'weekly-pay'].sort(),
    'every scheduled job is on the board, including the ones that cannot be pressed',
  );

  const pay = response.body.data.jobs.find((job) => job.name === 'weekly-pay');
  assert.equal(pay.manual, false, 'the ledger closes a week; it is not a button');
  assert.equal(response.body.data.running, true);
  assert.equal(response.body.data.failuresToday, 0);
});

test('the run board is the owner’s, not the desk’s', async () => {
  const asEditor = await request(app)
    .get('/api/admin/scheduler/runs')
    .set('Authorization', `Bearer ${editorToken}`);
  assert.equal(asEditor.status, 403);

  const asAnonymous = await request(app).get('/api/admin/scheduler/runs');
  assert.equal(asAnonymous.status, 401);

  const pressAsEditor = await request(app)
    .post('/api/admin/scheduler/run/publish')
    .set('Authorization', `Bearer ${editorToken}`);
  assert.equal(pressAsEditor.status, 403);
});

test('pressing the publishing job runs it and writes down that it ran', async () => {
  const story = await timedStory('Timed for a minute already gone');

  const pressed = await request(app)
    .post('/api/admin/scheduler/run/publish')
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(pressed.status, 200);
  assert.equal(pressed.body.data.did.published, 1);

  const published = await Article.findById(story._id);
  assert.equal(published.status, 'published');
  assert.equal(published.scheduledAt, null, 'a story is published once, not every five minutes for ever');

  const rows = await SchedulerRun.find({ job: 'publish' }).sort({ createdAt: -1 }).lean();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'ok');
  assert.equal(rows[0].trigger, 'admin', 'a press is tellable from a tick afterwards');
  assert.deepEqual(rows[0].did, { published: 1, held: 0 });
  assert.ok(Number.isFinite(rows[0].ms));
});

test('a press is refused before the last one has lost its meaning', async () => {
  // Same job, same admin, one second later: the cooldown is what stops a bored
  // operator asking the sports feed the same question forty times a minute.
  const second = await request(app)
    .post('/api/admin/scheduler/run/publish')
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(second.status, 429);
  assert.match(second.body.message, /Try again in/);

  const unknown = await request(app)
    .post('/api/admin/scheduler/run/not-a-job')
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(unknown.status, 404);

  const ledger = await request(app)
    .post('/api/admin/scheduler/run/weekly-pay')
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(ledger.status, 409);
  assert.match(ledger.body.message, /payout queue/, 'and the refusal says why it is not a button');
});

test('a job that throws is reported, not rethrown, and the board turns red', async () => {
  await SchedulerRun.deleteMany({});
  const original = liveScoreService.refreshWatched;
  liveScoreService.refreshWatched = async () => {
    const error = new Error('the feed is down');
    // What a real throw carries, and the part that must never reach the board:
    // the build's own paths are nobody's diagnostic.
    error.stack = 'Error: the feed is down\n    at Object.run (D:/secret/node_modules/x.js:1:1)';
    throw error;
  };

  let result;
  try {
    result = await scheduler.runJob('scores');
  } finally {
    liveScoreService.refreshWatched = original;
  }
  assert.equal(result.status, 'failed', 'the caller is a clock tick, which must not explode');

  const row = await SchedulerRun.findOne({ job: 'scores' }).lean();
  assert.equal(row.status, 'failed');
  assert.match(row.error, /the feed is down/);
  assert.ok(!row.error.includes('node_modules'), 'the stack is not stored, only the sentence');

  const desk = await schedulerLog.desk();
  assert.equal(desk.failuresToday, 1);
  assert.equal(desk.latest.scores.status, 'failed');
});

test('a pass that overlaps itself is written as skipped, not as a quiet minute', async () => {
  await SchedulerRun.deleteMany({});
  const original = liveScoreService.refreshWatched;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  liveScoreService.refreshWatched = async () => {
    await gate;
    return { refreshed: 1, failed: 0, watched: 1 };
  };
  try {
    const first = scheduler.runJob('scores');
    const second = await scheduler.runJob('scores', { trigger: 'admin' });
    assert.equal(second.status, 'skipped');
    assert.match(second.reason, /previous pass has not finished/);
    release();
    await first;
  } finally {
    liveScoreService.refreshWatched = original;
  }

  const rows = await SchedulerRun.find({ job: 'scores' }).sort({ createdAt: 1 }).lean();
  assert.equal(rows.length, 2, 'both the stuck pass and the one that refused to start are on the board');
  assert.equal(rows[0].status, 'skipped');
  assert.equal(rows[0].trigger, 'admin');
  assert.equal(rows[1].status, 'ok');
});

test('the log keeps counts, not the copy', async () => {
  await SchedulerRun.deleteMany({});
  await schedulerLog.record({
    job: 'publish',
    status: 'ok',
    did: {
      published: 3,
      held: 1,
      headline: 'A whole sentence about a fire in Kigali that nobody needs in a diagnostic log',
      document: { content: 'the story itself' },
      ok: true,
    },
    error: 'x'.repeat(900),
    ms: 12.6,
  });

  const row = await SchedulerRun.findOne({ job: 'publish' }).lean();
  assert.deepEqual(row.did, { published: 3, held: 1, ok: true }, 'a long string and a nested document are not counts');
  assert.equal(row.error.length, 400, 'the sentence is kept and the noise around it is cut');
  assert.equal(row.ms, 13);
});
