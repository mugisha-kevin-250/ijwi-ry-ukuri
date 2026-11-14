const cron = require('node-cron');
const Article = require('../models/Article');
const workflow = require('../services/articleWorkflow');
const rewardService = require('../services/rewardService');
const radioService = require('../services/radioService');
const env = require('../config/env');

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
  for (const article of due) {
    const result = await workflow.moveStory({ article, to: 'published', by: null });
    // The story stays approved and is tried again next run rather than being
    // forced through a rule that refuses it.
    if (result.error) {
      console.warn(`Scheduled story ${article._id} stayed in review: ${result.error}`);
      continue;
    }
    article.scheduledAt = null;
    await article.save();
    published += 1;
  }
  return published;
}

// Monday just after midnight, in the server's own zone: last week is closed, so
// the views on record can be paid and the payout queue can be filled.
async function runWeeklyPay() {
  const stats = await rewardService.generateWeeklyStats();
  await rewardService.createPayoutForEligibleEarnings();
  return stats;
}

function startScheduler() {
  if (!env.ENABLE_SCHEDULER) {
    console.log('Scheduler disabled by ENABLE_SCHEDULER=false.');
    return null;
  }

  const options = { timezone: env.SCHEDULER_TZ };

  cron.schedule('*/5 * * * *', async () => {
    try {
      const published = await publishDueStories();
      if (published) console.log(`Published ${published} story/stories that were due.`);
    } catch (error) {
      console.error('Scheduled publishing run failed:', error?.message || error);
    }
  }, options);

  // The bulletin a reader hears is assembled the first time someone asks for it,
  // so this is not what makes the radio work - it is what makes it work *promptly*.
  // Without it the reader who arrives one minute after the six o'clock has to wait
  // for a model call while the page sits there, and on a free host that sleeps
  // between visits, that reader is the only thing that ever wakes it.
  cron.schedule('* * * * *', async () => {
    try {
      const aired = await radioService.airDueBulletin();
      if (aired) {
        console.log(`Radio: ${aired.slotName} ${aired.occurrence} assembled with ${aired.stories} stor${aired.stories === 1 ? 'y' : 'ies'} (${aired.scriptSource}).`);
      }
    } catch (error) {
      console.error('Radio bulletin run failed:', error?.message || error);
    }
  }, options);

  cron.schedule('10 0 * * 1', async () => {
    try {
      const week = await runWeeklyPay();
      console.log(`Computed pay for week starting ${week.weekStart.toISOString()} across ${week.writers} writer(s).`);
    } catch (error) {
      console.error('Weekly pay run failed:', error?.message || error);
    }
  }, options);

  console.log('Scheduler started: story publishing every 5 minutes, the radio bulletin on the minute, weekly pay on Mondays.');
  return { publishDueStories, runWeeklyPay, airDueBulletin: radioService.airDueBulletin };
}

module.exports = { startScheduler, publishDueStories, runWeeklyPay };
