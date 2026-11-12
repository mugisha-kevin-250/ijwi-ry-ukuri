const express = require('express');
const Article = require('../models/Article');
const User = require('../models/User');
const WriterEarning = require('../models/WriterEarning');
const Payout = require('../models/Payout');
const Category = require('../models/Category');
const WriterProfile = require('../models/WriterProfile');
const PlatformSetting = require('../models/PlatformSetting');
const { protect, authorize } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const notificationService = require('../services/notificationService');
const geminiService = require('../services/geminiService');
const generateSlug = require('../utils/generateSlug');
const escapeRegex = require('../utils/escapeRegex');
const { plainText, cleanText, cleanTags, safeMediaUrl } = require('../utils/textFields');

const router = express.Router();

const USER_ROLES = ['READER', 'WRITER', 'EDITOR', 'ADMIN'];
const WRITER_STATES = ['pending', 'approved', 'rejected', 'suspended'];

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
    if (req.body.role) {
      const role = String(req.body.role).toUpperCase();
      if (!USER_ROLES.includes(role)) return errorResponse(res, 400, 'Unknown role');
      allowed.role = role;
    }
    if (typeof req.body.isActive === 'boolean') allowed.isActive = req.body.isActive;
    if (req.body.writerStatus) {
      const writerStatus = String(req.body.writerStatus);
      if (!WRITER_STATES.includes(writerStatus)) return errorResponse(res, 400, 'Unknown writer status');
      allowed.writerStatus = writerStatus;
    }
    if (!Object.keys(allowed).length) return errorResponse(res, 400, 'Nothing to update');

    const user = await User.findByIdAndUpdate(req.params.id, { $set: allowed }, { new: true, runValidators: true }).lean();
    if (!user) return errorResponse(res, 404, 'User not found');
    return successResponse(res, 200, 'User updated', { user });
  } catch (error) {
    next(error);
  }
});

// Applications sit in WriterProfile with status 'pending'; the account itself is
// still a READER until an ADMIN approves it here.
router.get('/writer-requests', async (req, res, next) => {
  try {
    const status = req.query.status === 'all'
      ? null
      : (WRITER_STATES.includes(req.query.status) ? req.query.status : 'pending');
    const profiles = await WriterProfile.find(status ? { status } : {})
      .sort({ createdAt: -1 })
      .populate({ path: 'user', select: 'fullName username email avatar country role writerStatus isActive createdAt' })
      .lean();

    return successResponse(res, 200, 'Writer applications', {
      applications: profiles.filter((profile) => profile.user),
      pendingCount: status === 'pending'
        ? profiles.length
        : await WriterProfile.countDocuments({ status: 'pending' })
    });
  } catch (error) {
    next(error);
  }
});

router.post('/writer-requests/:id/approve', authorize('ADMIN'), async (req, res, next) => {
  try {
    const profile = await WriterProfile.findById(req.params.id);
    if (!profile) return errorResponse(res, 404, 'Application not found');
    const user = await User.findById(profile.user);
    if (!user) return errorResponse(res, 404, 'Applicant account is gone');

    profile.status = 'approved';
    await profile.save();

    // Never demote an EDITOR or ADMIN who happened to apply.
    if (user.role === 'READER') user.role = 'WRITER';
    user.writerStatus = 'approved';
    user.writerProfile = profile._id;
    await user.save();

    return successResponse(res, 200, 'Writer approved', { user: user.toObject({ virtuals: false }), profile });
  } catch (error) {
    next(error);
  }
});

router.post('/writer-requests/:id/reject', authorize('ADMIN'), async (req, res, next) => {
  try {
    const profile = await WriterProfile.findById(req.params.id);
    if (!profile) return errorResponse(res, 404, 'Application not found');

    profile.status = 'rejected';
    await profile.save();

    const user = await User.findById(profile.user);
    if (user) {
      // A writer who was already approved keeps working; only the application closes.
      user.writerStatus = 'rejected';
      await user.save();
      return successResponse(res, 200, 'Writer application rejected', { user, profile });
    }
    return successResponse(res, 200, 'Writer application rejected', { profile });
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

    const firstPublish = article.status !== 'published' && status === 'published';
    article.status = status;
    if (status === 'published' && !article.publishedAt) article.publishedAt = new Date();
    await article.save();
    if (firstPublish) await notificationService.announceArticlePublished(article);

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
    payout.rejectionReason = plainText(req.body.rejectionReason, { maxLength: 300 }) || 'Rejected by administrator';
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

async function isAutoPublishOn() {
  const setting = await PlatformSetting.findOne({ key: 'aiAutoPublish' });
  return setting?.value === true || setting?.value === 'true';
}

// Gemini only ever answers the admin portal, and nothing it writes reaches a
// reader without either this switch or the admin's own click.
router.get('/ai/status', authorize('ADMIN'), async (req, res, next) => {
  try {
    return successResponse(res, 200, 'AI writer status', {
      configured: geminiService.isConfigured(),
      model: geminiService.activeModel(),
      autoPublish: await isAutoPublishOn()
    });
  } catch (error) {
    next(error);
  }
});

router.put('/ai/auto-publish', authorize('ADMIN'), async (req, res, next) => {
  try {
    const enabled = req.body?.enabled === true || req.body?.enabled === 'true';
    await PlatformSetting.findOneAndUpdate(
      { key: 'aiAutoPublish' },
      { $set: { key: 'aiAutoPublish', value: enabled, description: 'Publish AI-drafted stories without waiting for the admin' } },
      { upsert: true, new: true }
    );
    return successResponse(res, 200, enabled ? 'AI stories will publish at once' : 'AI stories will wait for review', { autoPublish: enabled });
  } catch (error) {
    next(error);
  }
});

// Produces a story and hands it back for the admin to read. Nothing is stored
// or published here - that only happens through POST /ai/articles below.
router.post('/ai/generate', authorize('ADMIN'), async (req, res, next) => {
  try {
    const { topic, angle, audience } = req.body || {};
    if (!topic || String(topic).trim().length < 6) {
      return errorResponse(res, 400, 'Describe the topic the story should cover');
    }
    const story = await geminiService.writeStory({
      topic: plainText(topic, { maxLength: 500 }),
      angle: angle ? plainText(angle, { maxLength: 500 }) : '',
      audience: audience === 'world' ? 'world' : 'rwanda'
    });
    return successResponse(res, 200, 'Draft ready for review', story);
  } catch (error) {
    if (error.code === 'AI_NOT_CONFIGURED') return errorResponse(res, 503, error.message);
    if (String(error.code || '').startsWith('AI_')) return errorResponse(res, 502, error.message);
    next(error);
  }
});

router.post('/ai/articles', authorize('ADMIN'), async (req, res, next) => {
  try {
    const { title, summary, content, category, tags = [], featuredImage, publish } = req.body || {};
    if (!title || !summary || !content || !category) {
      return errorResponse(res, 400, 'Title, summary, content and category are required');
    }
    const categoryDoc = await Category.findById(category);
    if (!categoryDoc) return errorResponse(res, 404, 'Category not found');

    const wantsPublish = publish === undefined ? await isAutoPublishOn() : publish === true || publish === 'true';
    const publishedAt = wantsPublish ? new Date() : undefined;
    // The text comes back from the browser, so it is cleaned the same way a
    // writer's story is - a machine can hand over a headline carrying markup.
    const headline = plainText(title, { maxLength: 200 });
    const body = cleanText(content, { maxLength: 60000 });
    const gist = cleanText(summary, { maxLength: 600 });
    if (!headline || !body || !gist) {
      return errorResponse(res, 400, 'Title, summary and content have to say something');
    }
    // A title in one of the languages we cannot slug leaves an empty address,
    // which would break the story route.
    const baseSlug = generateSlug(headline) || 'inkuru';
    const article = await Article.create({
      title: headline,
      slug: `${baseSlug}-${Date.now()}`,
      summary: gist,
      content: body,
      featuredImage: safeMediaUrl(featuredImage),
      author: req.user._id,
      category: categoryDoc._id,
      tags: cleanTags(tags, { max: 6 }),
      language: 'en',
      aiGenerated: true,
      status: wantsPublish ? 'published' : 'draft',
      publishedAt
    });

    if (wantsPublish) await notificationService.announceArticlePublished(article);

    return successResponse(res, 201, wantsPublish ? 'Story published' : 'Story saved as a draft', { article });
  } catch (error) {
    next(error);
  }
});

router.get('/ai/articles', authorize('ADMIN'), async (req, res, next) => {
  try {
    const articles = await Article.find({ aiGenerated: true })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('category', 'name slug');
    const pendingReview = await Article.countDocuments({ aiGenerated: true, status: 'draft' });
    return successResponse(res, 200, 'AI stories', { articles, pendingReview });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
