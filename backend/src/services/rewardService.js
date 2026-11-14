const WriterWeeklyStat = require('../models/WriterWeeklyStat');
const WriterEarning = require('../models/WriterEarning');
const Payout = require('../models/Payout');
const PlatformSetting = require('../models/PlatformSetting');
const Article = require('../models/Article');
const ArticleView = require('../models/ArticleView');
const User = require('../models/User');

const DAY_MS = 24 * 60 * 60 * 1000;

// The two figures that decide pay live only in PlatformSetting. These defaults
// are what the server has always paid with when an admin has not set them, so
// one source of truth keeps the ledger and the writer-facing API quoting the
// same number.
const DEFAULT_REWARD_RATE = 5000;
const DEFAULT_MINIMUM_PAYOUT = 10000;

async function getRewardSettings() {
  const [rateDoc, minimumDoc] = await Promise.all([
    PlatformSetting.findOne({ key: 'rewardRate' }),
    PlatformSetting.findOne({ key: 'minimumPayout' }),
  ]);
  return {
    rewardRate: Number(rateDoc?.value || DEFAULT_REWARD_RATE),
    minimumPayout: Number(minimumDoc?.value || DEFAULT_MINIMUM_PAYOUT),
  };
}

function getWeekBounds(date = new Date()) {
  const start = new Date(date);
  const day = start.getDay();
  const diffToMonday = (day === 0 ? -6 : 1 - day);
  start.setDate(start.getDate() + diffToMonday);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  end.setHours(23, 59, 59, 999);
  return { weekStart: start, weekEnd: end };
}

async function calculateWriterStatsForWeek(writerId, weekStart, weekEnd) {
  const articles = await Article.find({ author: writerId, status: 'published' }).select('_id validViews likes commentsCount');
  const articleIds = articles.map((article) => article._id);

  const totalValidViews = articles.reduce((sum, article) => sum + Number(article.validViews || 0), 0);
  const totalLikes = articles.reduce((sum, article) => sum + Number(article.likes || 0), 0);

  const topArticle = articles.sort((a, b) => (b.validViews || 0) - (a.validViews || 0))[0] || null;
  const { rewardRate } = await getRewardSettings();
  const calculatedReward = (totalValidViews / 1000) * rewardRate;

  return {
    writerId,
    weekStart,
    weekEnd,
    totalArticles: articles.length,
    totalValidViews,
    totalLikes,
    totalComments: 0,
    topArticle: topArticle?._id || null,
    calculatedReward,
    status: 'pending'
  };
}

async function generateWeeklyStats() {
  const { weekStart, weekEnd } = getWeekBounds(new Date(Date.now() - 7 * DAY_MS));
  const { rewardRate } = await getRewardSettings();
  const writers = await User.find({ role: 'WRITER' }).select('_id');

  for (const writer of writers) {
    const stats = await calculateWriterStatsForWeek(writer._id, weekStart, weekEnd);
    const existing = await WriterWeeklyStat.findOne({ writerId: writer._id, weekStart });
    if (!existing) {
      await WriterWeeklyStat.create(stats);
    }

    // A zero-reward week still writes the WriterWeeklyStat above, so the ledger
    // can tell "computed, earned nothing" from "never computed"; only a week
    // with money in it earns a WriterEarning row to pay out against.
    const earning = await WriterEarning.findOne({ writerId: writer._id, weekStart });
    if (!earning && stats.calculatedReward > 0) {
      await WriterEarning.create({
        writerId: writer._id,
        weekStart,
        weekEnd,
        validViews: stats.totalValidViews,
        rewardRate,
        calculatedAmount: stats.calculatedReward,
        approvedAmount: 0,
        status: 'pending'
      });
    }
  }

  return { weekStart, weekEnd, writers: writers.length };
}

async function createPayoutForEligibleEarnings() {
  const earnings = await WriterEarning.find({ status: 'pending' });
  const { minimumPayout } = await getRewardSettings();

  for (const earning of earnings) {
    if (earning.calculatedAmount >= minimumPayout) {
      const existing = await Payout.findOne({ earningId: earning._id, status: { $in: ['pending', 'approved', 'paid'] } });
      if (!existing) {
        await Payout.create({
          writerId: earning.writerId,
          earningId: earning._id,
          amount: earning.calculatedAmount,
          currency: 'RWF',
          status: 'pending',
          paymentMethod: 'bank_transfer'
        });
      }
    }
  }
}

// The money the writer-facing API reports, built only from real records. Every
// number here has a source the writer can point at, and lastComputedWeek says
// plainly whether the pay ledger has ever run - so an empty account reads as
// "not computed yet" instead of a fabricated RWF 0.
async function getWriterEarningsSummary(writerId) {
  const settings = await getRewardSettings();
  const thisWeek = getWeekBounds(new Date());
  const lastWeek = getWeekBounds(new Date(Date.now() - 7 * DAY_MS));

  const [newestStat, newestEarning, allEarnings, currentLive] = await Promise.all([
    WriterWeeklyStat.findOne({ writerId }).sort({ weekStart: -1 }).select('weekStart').lean(),
    WriterEarning.findOne({ writerId }).sort({ weekStart: -1 }).select('weekStart').lean(),
    WriterEarning.find({ writerId }).select('calculatedAmount').lean(),
    calculateWriterStatsForWeek(writerId, thisWeek.weekStart, thisWeek.weekEnd),
  ]);

  const weeks = [newestStat?.weekStart, newestEarning?.weekStart].filter(Boolean);
  const lastComputedWeek = weeks.length ? new Date(Math.max(...weeks.map((week) => new Date(week).getTime()))) : null;

  // This week is still open, so the ledger has no row for it yet; the honest
  // figure is the live reward the same formula would pay on the views on record.
  const currentEarnings = Number(currentLive.calculatedReward || 0);
  const totalEarnings = allEarnings.reduce((sum, earning) => sum + Number(earning.calculatedAmount || 0), 0);

  let previousWeeklyEarnings = 0;
  const prevEarning = await WriterEarning.findOne({ writerId, weekStart: lastWeek.weekStart }).lean();
  if (prevEarning) {
    previousWeeklyEarnings = Number(prevEarning.calculatedAmount || 0);
  } else {
    const prevStat = await WriterWeeklyStat.findOne({ writerId, weekStart: lastWeek.weekStart }).lean();
    if (prevStat) previousWeeklyEarnings = Number(prevStat.calculatedReward || 0);
  }

  return {
    currentEarnings,
    previousWeeklyEarnings,
    totalEarnings,
    lastComputedWeek,
    rewardRate: settings.rewardRate,
    minimumPayout: settings.minimumPayout,
  };
}

module.exports = {
  getRewardSettings,
  getWeekBounds,
  calculateWriterStatsForWeek,
  generateWeeklyStats,
  createPayoutForEligibleEarnings,
  getWriterEarningsSummary
};
