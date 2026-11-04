const WriterWeeklyStat = require('../models/WriterWeeklyStat');
const WriterEarning = require('../models/WriterEarning');
const Payout = require('../models/Payout');
const PlatformSetting = require('../models/PlatformSetting');
const Article = require('../models/Article');
const ArticleView = require('../models/ArticleView');
const User = require('../models/User');

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
  const rewardRate = Number((await PlatformSetting.findOne({ key: 'rewardRate' }))?.value || 5000);
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
  const { weekStart, weekEnd } = getWeekBounds(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  const writers = await User.find({ role: 'WRITER' }).select('_id');

  for (const writer of writers) {
    const stats = await calculateWriterStatsForWeek(writer._id, weekStart, weekEnd);
    const existing = await WriterWeeklyStat.findOne({ writerId: writer._id, weekStart });
    if (!existing) {
      await WriterWeeklyStat.create(stats);
    }

    const earning = await WriterEarning.findOne({ writerId: writer._id, weekStart });
    if (!earning && stats.calculatedReward > 0) {
      await WriterEarning.create({
        writerId: writer._id,
        weekStart,
        weekEnd,
        validViews: stats.totalValidViews,
        rewardRate: Number((await PlatformSetting.findOne({ key: 'rewardRate' }))?.value || 5000),
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
  const minimumPayout = Number((await PlatformSetting.findOne({ key: 'minimumPayout' }))?.value || 10000);

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

module.exports = {
  getWeekBounds,
  calculateWriterStatsForWeek,
  generateWeeklyStats,
  createPayoutForEligibleEarnings
};
