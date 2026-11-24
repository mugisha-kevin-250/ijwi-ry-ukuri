const SchedulerRun = require('../models/SchedulerRun');
const env = require('../config/env');

/**
 * The scheduler's own record of what it did.
 *
 * A cron job that only speaks to stdout is a job nobody can be told about: the
 * owner reports "the six o'clock story never went out", and there is no answer
 * except to guess. So every turn writes one line here - what it counted, how
 * long it took, and the thrown sentence if it failed - and the admin desk reads
 * that line back.
 *
 * Two rules keep it useful rather than noisy. Nothing here throws: a database
 * having a bad minute must not turn into "the newsroom cannot publish its
 * stories", which is the job the log was meant to observe. And nothing here is
 * story text - a run says `{ published: 2 }`, never which two.
 */

// A diagnostic, not an archive. Two weeks is long enough to answer "has this
// been failing since the deploy?" and short enough that the collection is never
// the thing a free database runs out of room on.
const KEEP_DAYS = 14;

const ERROR_MAX = 400;

/**
 * Keep only the counts and short labels a desk can read.
 *
 * A job could hand back an object with a document inside it, and that document
 * is a story with names in it. Anything that is not a number, a boolean or a
 * short string is dropped rather than truncated, so the shape of what is stored
 * stays boring.
 */
function tidy(did) {
  if (!did || typeof did !== 'object') return undefined;
  const clean = {};
  for (const [key, value] of Object.entries(did).slice(0, 8)) {
    if (!/^[a-z][a-z0-9_-]{0,23}$/i.test(key)) continue;
    if (typeof value === 'number' && Number.isFinite(value)) clean[key] = Math.round(value);
    else if (typeof value === 'boolean') clean[key] = value;
    else if (typeof value === 'string' && value.length <= 48) clean[key] = value;
  }
  return Object.keys(clean).length ? clean : undefined;
}

async function record({ job, status, trigger = 'cron', did, ms, error }) {
  try {
    await SchedulerRun.create({
      job: String(job || 'job').toLowerCase(),
      status,
      trigger,
      did: tidy(did),
      ms: Number.isFinite(ms) ? Math.round(ms) : undefined,
      error: error ? String(error).slice(0, ERROR_MAX) : undefined,
    });
    await SchedulerRun.deleteMany({ createdAt: { $lt: new Date(Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000) } });
  } catch (writeFailure) {
    console.warn('could not store the scheduler outcome:', writeFailure.message);
  }
}

/**
 * Run one job and write down what happened.
 *
 * The console line stays because the host's log is still where an operator
 * looks first; the database row is what makes that line readable a week later.
 * A failure is reported, never rethrown: the caller here is a cron tick, and an
 * unhandled rejection from a scheduled pass is how a whole service is restarted
 * for nothing.
 */
async function track({ job, trigger = 'cron', fn }) {
  const started = Date.now();
  try {
    const did = await fn();
    const ms = Date.now() - started;
    await record({ job, status: 'ok', trigger, did, ms });
    console.log(`Scheduler ${job} (${trigger}) ok in ${ms}ms${did ? ` ${JSON.stringify(did)}` : ''}`);
    return { status: 'ok', did, ms };
  } catch (error) {
    const ms = Date.now() - started;
    const message = String(error?.message || error).slice(0, ERROR_MAX);
    await record({ job, status: 'failed', trigger, ms, error: message });
    console.error(`Scheduler ${job} (${trigger}) failed: ${message}`);
    return { status: 'failed', error: message, ms };
  }
}

/**
 * Note a turn that never started, because the last one is still going.
 *
 * This is written by hand rather than through `track()` - there is no call to
 * time - but it belongs in the same list, because "the pass is stuck behind
 * itself" is the failure an admin most needs to see and least can infer.
 */
async function skipped({ job, trigger = 'cron', reason }) {
  await record({ job, status: 'skipped', trigger, error: reason });
  console.warn(`Scheduler ${job} skipped: ${reason}`);
  return { status: 'skipped', reason };
}

/**
 * What the desk shows: the last turns, and the newest line per job.
 *
 * The `latest` map is what lets the page say "publish: failed 40 minutes ago"
 * without the operator scanning a list, and it comes from one pass over the
 * newest rows rather than one query per job - there are five jobs and the
 * history is short.
 */
async function desk(limit = 40) {
  const size = Math.min(200, Math.max(5, Number(limit) || 40));
  const [runs, failures, total] = await Promise.all([
    SchedulerRun.find().sort({ createdAt: -1 }).limit(size).lean(),
    SchedulerRun.countDocuments({ status: 'failed', createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
    SchedulerRun.countDocuments({}),
  ]);

  const latest = {};
  for (const run of runs) {
    if (!latest[run.job]) latest[run.job] = run;
  }

  return {
    runs,
    latest,
    failuresToday: failures,
    stored: total,
    // Whether this process is the one that runs the clock at all. On a host with
    // several instances, or with ENABLE_SCHEDULER turned off, saying so is the
    // difference between "the jobs are failing" and "this box never runs them".
    running: Boolean(env.ENABLE_SCHEDULER),
    coordination: 'shared MongoDB lease locks',
    leaseMs: Number(env.SCHEDULER_LOCK_LEASE_MS || 600000),
    timezone: env.SCHEDULER_TZ || 'server',
    keepDays: KEEP_DAYS,
  };
}

module.exports = { track, skipped, record, desk, KEEP_DAYS };
