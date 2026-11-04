const express = require('express');
const Article = require('../models/Article');
const User = require('../models/User');
const WriterEarning = require('../models/WriterEarning');
const Payout = require('../models/Payout');
const Category = require('../models/Category');
const PlatformSetting = require('../models/PlatformSetting');
const { protect, authorize } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/apiResponse');

const router = express.Router();

router.use(protect, authorize('ADMIN', 'EDITOR'));

router.get('/dashboard', async (req, res, next) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalReaders = await User.countDocuments({ role: 'READER' });
    const totalWriters = await User.countDocuments({ role: 'WRITER' });
    const totalEditors = await User.countDocuments({ role: 'EDITOR' });
    const publishedArticles = await Article.countDocuments({ status: 'published' });
    const pendingArticles = await Article.countDocuments({ status: 'pending_review' });
    const rejectedArticles = await Article.countDocuments({ status: 'rejected' });
    const totalViews = await Article.aggregate([{ $group: { _id: null, total: { $sum: '$views' } } }]);
    const validViews = await Article.aggregate([{ $group: { _id: null, total: { $sum: '$validViews' } } }]);
    const pendingEarnings = await WriterEarning.countDocuments({ status: 'pending' });
    const pendingPayouts = await Payout.countDocuments({ status: 'pending' });
    const totalPaidAmount = await Payout.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [viewsThisWeek, viewsThisMonth, topArticles, topWriters] = await Promise.all([
      Article.aggregate([
        { $match: { status: 'published', publishedAt: { $gte: sevenDaysAgo } } },
        { $group: { _id: null, total: { $sum: '$views' } } }
      ]),
      Article.aggregate([
        { $match: { status: 'published', publishedAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: null, total: { $sum: '$views' } } }
      ]),
      Article.find({ status: 'published' })
        .sort({ views: -1, validViews: -1, publishedAt: -1 })
        .limit(10)
        .select('-content')
        .populate('author', 'fullName username avatar')
        .populate('category', 'name slug')
        .lean(),
      Article.aggregate([
        { $match: { status: 'published' } },
        { $group: { _id: '$author', articles: { $sum: 1 }, views: { $sum: '$views' } } },
        { $sort: { views: -1 } },
        { $limit: 10 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 1, fullName: '$user.fullName', username: '$user.username', avatar: '$user.avatar', articles: 1, views: 1 } }
      ])
    ]);

    return successResponse(res, 200, 'Admin dashboard', {
      totalUsers,
      totalReaders,
      totalWriters,
      totalEditors,
      publishedArticles,
      pendingArticles,
      rejectedArticles,
      totalViews: totalViews[0]?.total || 0,
      validViews: validViews[0]?.total || 0,
      viewsThisWeek: viewsThisWeek[0]?.total || 0,
      viewsThisMonth: viewsThisMonth[0]?.total || 0,
      topArticles,
      topWriters,
      pendingEarnings,
      pendingPayouts,
      totalPaidAmount: totalPaidAmount[0]?.total || 0
    });
  } catch (error) {
    next(error);
  }
});

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/users', async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const { role, search } = req.query;

    const match = {};
    if (role) match.role = String(role).toUpperCase();
    if (search) {
      const pattern = new RegExp(escapeRegex(search), 'i');
      match.$or = [{ fullName: pattern }, { username: pattern }, { email: pattern }];
    }

    const [users, total] = await Promise.all([
      User.find(match).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      User.countDocuments(match)
    ]);

    const ids = users.map((user) => user._id);
    const stats = await Article.aggregate([
      { $match: { author: { $in: ids } } },
      { $group: { _id: '$author', articles: { $sum: 1 }, views: { $sum: '$views' }, published: { $sum: { $cond: [{ $eq: ['$status', 'published'] }, 1, 0] } } } }
    ]);
    const statsMap = new Map(stats.map((item) => [String(item._id), item]));

    return successResponse(res, 200, 'Users', {
      users: users.map((user) => ({
        ...user,
        articleCount: statsMap.get(String(user._id))?.articles || 0,
        publishedCount: statsMap.get(String(user._id))?.published || 0,
        totalViews: statsMap.get(String(user._id))?.views || 0
      })),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1
    });
  } catch (error) {
    next(error);
  }
});

router.get('/users/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).lean();
    if (!user) return errorResponse(res, 404, 'User not found');

    const articles = await Article.find({ author: user._id })
      .sort({ createdAt: -1 })
      .select('-content')
      .populate('category', 'name slug')
      .lean();

    const stats = articles.reduce(
      (acc, article) => {
        acc.views += article.views || 0;
        acc.likes += article.likes || 0;
        if (article.status === 'published') acc.published += 1;
        if (article.status === 'pending_review') acc.pending += 1;
        return acc;
      },
      { views: 0, likes: 0, published: 0, pending: 0 }
    );

    return successResponse(res, 200, 'User details', { user, articles, stats, totalArticles: articles.length });
  } catch (error) {
    next(error);
  }
});

router.put('/users/:id', protect, authorize('ADMIN'), async (req, res, next) => {
  try {
    if (String(req.params.id) === String(req.user._id) && req.body.role && req.body.role !== 'ADMIN') {
      return errorResponse(res, 400, 'You cannot remove your own admin role');
    }
    if (String(req.params.id) === String(req.user._id) && req.body.isActive === false) {
      return errorResponse(res, 400, 'You cannot deactivate your own account');
    }

    const allowed = {};
    if (req.body.role) allowed.role = String(req.body.role).toUpperCase();
    if (typeof req.body.isActive === 'boolean') allowed.isActive = req.body.isActive;
    if (req.body.writerStatus) allowed.writerStatus = req.body.writerStatus;
    if (!Object.keys(allowed).length) return errorResponse(res, 400, 'Nothing to update');

    const user = await User.findByIdAndUpdate(req.params.id, { $set: allowed }, { new: true }).lean();
    if (!user) return errorResponse(res, 404, 'User not found');
    return successResponse(res, 200, 'User updated', { user });
  } catch (error) {
    next(error);
  }
});

router.get('/articles', async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const { status, category, search } = req.query;
    const sortKey = req.query.sort === 'latest' ? 'createdAt' : req.query.sort === 'oldest' ? 'createdAt' : 'views';
    const direction = req.query.sort === 'oldest' ? 1 : -1;

    const match = {};
    if (status) match.status = status;
    if (search) {
      const pattern = new RegExp(escapeRegex(search), 'i');
      match.$or = [{ title: pattern }, { summary: pattern }, { tags: pattern }];
    }
    if (category) {
      const found = await Category.findOne({
        $or: [{ slug: category }, { name: category }],
      }).select('_id');
      if (found) match.category = found._id;
    }

    const [articles, total] = await Promise.all([
      Article.find(match)
        .sort({ [sortKey]: direction, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('-content')
        .populate('author', 'fullName username avatar')
        .populate('category', 'name slug')
        .lean(),
      Article.countDocuments(match)
    ]);

    return successResponse(res, 200, 'Articles', { articles, total, page, limit, pages: Math.ceil(total / limit) || 1 });
  } catch (error) {
    next(error);
  }
});

router.put('/articles/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    const allowed = ['draft', 'pending_review', 'approved', 'rejected', 'published', 'archived'];
    if (!allowed.includes(status)) return errorResponse(res, 400, 'Invalid status');

    const article = await Article.findById(req.params.id);
    if (!article) return errorResponse(res, 404, 'Article not found');

    article.status = status;
    if (status === 'published' && !article.publishedAt) article.publishedAt = new Date();
    await article.save();

    const populated = await article.populate([
      { path: 'author', select: 'fullName username avatar' },
      { path: 'category', select: 'name slug' }
    ]);
    return successResponse(res, 200, 'Article status updated', { article: populated });
  } catch (error) {
    next(error);
  }
});

router.delete('/articles/:id', protect, authorize('ADMIN'), async (req, res, next) => {
  try {
    const article = await Article.findByIdAndDelete(req.params.id);
    if (!article) return errorResponse(res, 404, 'Article not found');
    return successResponse(res, 200, 'Article deleted', { article });
  } catch (error) {
    next(error);
  }
});

router.get('/earnings', async (req, res, next) => {
  try {
    const earnings = await WriterEarning.find({}).populate('writerId', 'fullName username');
    return successResponse(res, 200, 'Earnings', { earnings });
  } catch (error) {
    next(error);
  }
});

router.get('/payouts', async (req, res, next) => {
  try {
    const payouts = await Payout.find({}).populate('writerId', 'fullName username');
    return successResponse(res, 200, 'Payouts', { payouts });
  } catch (error) {
    next(error);
  }
});

router.put('/payouts/:id/approve', async (req, res, next) => {
  try {
    const payout = await Payout.findById(req.params.id);
    if (!payout) return errorResponse(res, 404, 'Payout not found');
    payout.status = 'approved';
    payout.approvedAt = new Date();
    await payout.save();
    return successResponse(res, 200, 'Payout approved', { payout });
  } catch (error) {
    next(error);
  }
});

router.put('/payouts/:id/reject', async (req, res, next) => {
  try {
    const payout = await Payout.findById(req.params.id);
    if (!payout) return errorResponse(res, 404, 'Payout not found');
    payout.status = 'rejected';
    payout.rejectionReason = req.body.rejectionReason || 'Rejected by administrator';
    await payout.save();
    return successResponse(res, 200, 'Payout rejected', { payout });
  } catch (error) {
    next(error);
  }
});

router.put('/payouts/:id/mark-paid', async (req, res, next) => {
  try {
    const payout = await Payout.findById(req.params.id);
    if (!payout) return errorResponse(res, 404, 'Payout not found');
    payout.status = 'paid';
    payout.paidAt = new Date();
    await payout.save();
    return successResponse(res, 200, 'Payout marked paid', { payout });
  } catch (error) {
    next(error);
  }
});

router.get('/settings', async (req, res, next) => {
  try {
    const settings = await PlatformSetting.find({});
    return successResponse(res, 200, 'Platform settings', { settings });
  } catch (error) {
    next(error);
  }
});

router.post('/settings', async (req, res, next) => {
  try {
    const { key, value } = req.body;
    const setting = await PlatformSetting.findOneAndUpdate(
      { key },
      { $set: { key, value } },
      { upsert: true, new: true }
    );
    return successResponse(res, 201, 'Setting saved', { setting });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
