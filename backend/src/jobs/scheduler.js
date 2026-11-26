const cron = require('node-cron');
const Article = require('../models/Article');
const workflow = require('../services/articleWorkflow');
const rewardService = require('../services/rewardService');
const radioService = require('../services/radioService');
const liveScoreService = require('../services/liveScoreService');
const schedulerLog = require('../services/schedulerLog');
const breakingNews = require('../utils/breakingNews');
const env = require('../config/env');
const globalNewsService = require('../services/globalNewsService');
const schedulerLock = require('../services/schedulerLock');
const autoManageService = require('../services/autoManageService');

// Work the lifecycle has to finish on its own, because no person is standing
// at the server at 00:00 on Monday. Before this file existed node-cron was an
// installed dependency that nothing ever called, so the weekly pay ledger was
// never computed and every writer's earnings read as an empty RWF 0.
//
// Scheduled work is deliberately narrow: it may only publish a story an editor
// has already approved. A machine deciding that a draft faces readers would
// break the one rule the newsroom runs on - AI writes, a human publishes.
async function publishDueStories() {
  const due = await Article.find({
    status: 'approved',
    scheduledAt: { $ne: null, $lte: new Date() },
  }).limit(100);

  let published = 0;
  let held = 0;
  for (const article of due) {
    const result = await workflow.moveStory({ article, to: 'published', by: null });
    // The story stays approved and is tried again next run rather than being
    // forced through a rule that refuses it. `held` is what the desk then shows
    // as "2 due, 1 refused" instead of a silent queue that never empties.
    if (result.error) {
      console.warn(`Scheduled story ${article._id} stayed in review: ${result.error}`);
      held += 1;
      continue;
    }
    article.scheduledAt = null;
    await article.save();
    published += 1;
  }
  return { published, held };
}

// Monday just after midnight, in the server's own zone: last week is closed, so
// the views on record can be paid and the payout queue can be filled.
async function runWeeklyPay() {
  const stats = await rewardService.generateWeeklyStats();
  await rewardService.createPayoutForEligibleEarnings();
  return { writers: stats.writers };
}

/**
 * The clock's jobs, named the way the desk names them.
 *
 * Each one returns the small counts that go into the run log, so the line the
 * admin reads is the same sentence the process printed. `manual` is the part
 * that matters for the "run it now" button: publishing, the breaking expiry,
 * the radio bulletin and the scores pass are all idempotent - pressing them
 * twice costs one extra feed call and changes nothing a second time - while the
 * weekly ledger closes a week and hands out payouts, so a mid-week press is an
 * operator error waiting to happen and is refused rather than offered.
 */
const JOBS = {
  publish: {
    manual: true,
    every: '*/5 * * * *',
    summary: 'Stories the desk timed for a minute that has now gone.',
    run: () => publishDueStories(),
  },
  breaking: {
    manual: true,
    every: '*/5 * * * *',
    summary: 'Take the breaking label off the stories that have aged out.',
    run: async () => ({ expired: await breakingNews.expireStale({ Article, now: new Date() }) }),
  },
  radio: {
    manual: true,
    every: '* * * * *',
    summary: 'Assemble the bulletin whose slot has arrived.',
    run: async () => {
      const aired = await radioService.airDueBulletin();
      if (!aired) return {};
      return { stories: aired.stories, slot: String(aired.slotName || '').slice(0, 40) };
    },
  },
  scores: {
    manual: true,
    every: '* * * * *',
    summary: 'Re-read the competitions and matches readers have open.',
    run: async () => {
      const pass = await liveScoreService.refreshWatched({ now: new Date() });
      return { refreshed: pass.refreshed, failed: pass.failed, watched: pass.watched };
    },
  },
  'global-news': {
    manual: true,
    every: '*/10 * * * *',
    summary: 'Refresh permitted RSS feeds and quota-limited World News API headlines; deduplicate all story leads.',
    run: () => globalNewsService.refresh(),
  },
  'radar-auto-manage': {
    manual: true,
    every: '*/15 * * * *',
    summary: 'Research fresh Google Trends leads and create sourced AI drafts for editorial review when Auto Manage is enabled.',
    run: () => autoManageService.run(),
  },
  'weekly-pay': {
    manual: false,
    every: '10 0 * * 1',
    summary: 'Close last week and fill the payout queue. Not a manual job.',
    run: () => runWeeklyPay(),
  },
};

// A job that is still going when its next tick arrives must not be started
// twice. Both the cron and the admin's button come through here, so the lock
// that the scores pass used to keep for itself is now the whole scheduler's,
// and a press that lands mid-run says so instead of doubling the feed calls.
const inFlight = new Set();

/**
 * Run one named job, timed and written down.
 *
 * Returns `{ status, did }` or `{ status: 'failed', error }` - never throws,
 * because the caller is usually a clock tick and an unhandled rejection inside
 * one is how a healthy service gets restarted over a bad minute.
 */
async function runJob(name, { trigger = 'cron' } = {}) {
  const job = JOBS[name];
  if (!job) return { status: 'unknown', error: `There is no scheduled job called ${name}` };

  if (inFlight.has(name)) {
    return schedulerLog.skipped({
      job: name,
      trigger,
      reason: 'the previous pass has not finished in this process',
    });
  }

  inFlight.add(name);
  let lock;
  let heartbeat;
  try {
    try {
      lock = await schedulerLock.acquire(name);
    } catch (error) {
      const message = String(error?.message || error).slice(0, 400);
      await schedulerLog.record({ job: name, status: 'failed', trigger, error: `distributed lock unavailable: ${message}` });
      console.error(`Scheduler ${name} could not claim its distributed lock: ${message}`);
      return { status: 'failed', error: 'The shared scheduler lock could not be acquired.' };
    }

    if (!lock) {
      return schedulerLog.skipped({
        job: name,
        trigger,
        reason: 'another backend instance owns this scheduled job',
      });
    }

    // Keep the lease alive while a long-running pass is active. If the process
    // dies, renewals stop and another instance may recover the job after expiry.
    const renewEvery = Math.max(15_000, Math.floor(schedulerLock.leaseDuration() / 3));
    heartbeat = setInterval(() => {
      schedulerLock.renew(lock).then((owned) => {
        if (!owned) console.error(`Scheduler ${name} lost its distributed lease while running.`);
      }).catch((error) => {
        console.error(`Scheduler ${name} lease renewal failed: ${String(error?.message || error).slice(0, 200)}`);
      });
    }, renewEvery);
    if (typeof heartbeat.unref === 'function') heartbeat.unref();

    return await schedulerLog.track({ job: name, trigger, fn: job.run });
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    if (lock) {
      try {
        await schedulerLock.release(lock);
      } catch (error) {
        console.error(`Scheduler ${name} lock release failed: ${String(error?.message || error).slice(0, 200)}`);
      }
    }
    inFlight.delete(name);
  }
}

function startScheduler() {
  if (!env.ENABLE_SCHEDULER) {
    console.log('Scheduler disabled by ENABLE_SCHEDULER=false.');
    return null;
  }

  const options = { timezone: env.SCHEDULER_TZ };

  // One schedule per job, all of them through `runJob`, so a job cannot be
  // registered with a cron line and forgotten from the desk - or run by a cron
  // line whose outcome nobody records.
  for (const [name, job] of Object.entries(JOBS)) {
    cron.schedule(job.every, () => runJob(name), options);
  }

  console.log('Scheduler started: story publishing and breaking expiry every 5 minutes, radio and live scores every minute, global news every 10 minutes (World News API quota-limited to its configured interval), RADAR AI Auto Manage every 15 minutes when enabled, weekly pay on Mondays.');
  return { runJob, JOBS };
}

module.exports = { startScheduler, runJob, publishDueStories, runWeeklyPay, JOBS };
