const express = require('express');
const bcrypt = require('bcryptjs');
const Article = require('../models/Article');
const Category = require('../models/Category');
const User = require('../models/User');
const WriterProfile = require('../models/WriterProfile');
const ArticleView = require('../models/ArticleView');
const Like = require('../models/Like');
const Bookmark = require('../models/Bookmark');
const Follow = require('../models/Follow');
const WriterEarning = require('../models/WriterEarning');
const Payout = require('../models/Payout');
const { protect, authorize } = require('../middleware/auth');
const pushService = require('../utils/pushService');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const generateSlug = require('../utils/generateSlug');
const { getWeekBounds } = require('../services/rewardService');

const router = express.Router();

router.post('/apply', protect, async (req, res, next) => {
  try {
    const { fullName, username, bio, profileImage, country, language, reasonForWriting } = req.body;
    const existing = await WriterProfile.findOne({ user: req.user._id });
    if (existing) {
      return errorResponse(res, 400, 'Application already submitted');
    }

    const profile = await WriterProfile.create({
      user: req.user._id,
      fullName: fullName || req.user.fullName,
      username: username || req.user.username,
      bio,
      profileImage,
      country,
      language,
      reasonForWriting,
      status: 'pending'
    });

    req.user.role = 'WRITER';
    req.user.writerStatus = 'pending';
    req.user.writerProfile = profile._id;
    await req.user.save();

    return successResponse(res, 201, 'Writer application submitted', { profile });
  } catch (error) {
    next(error);
  }
});

router.post('/articles', protect, async (req, res, next) => {
  try {
    const { title, summary, content, category, tags = [], featuredImage } = req.body;
    if (!title || !summary || !content || !category) {
      return errorResponse(res, 400, 'Title, summary, content and category are required');
    }

    const categoryDoc = await Category.findById(category);
    if (!categoryDoc) {
      return errorResponse(res, 404, 'Category not found');
    }

    if (req.user.role === 'READER') {
      req.user.role = 'WRITER';
      await req.user.save();
    }

    const article = await Article.create({
      title,
      slug: `${generateSlug(title)}-${Date.now()}`,
      summary,
      content,
      featuredImage,
      author: req.user._id,
      category: categoryDoc._id,
      tags,
      status: 'draft',
      readingTime: Math.max(1, Math.ceil(content.length / 400))
    });

    return successResponse(res, 201, 'Article created', { article });
  } catch (error) {
    next(error);
  }
});

router.get('/articles', protect, async (req, res, next) => {
  try {
    const articles = await Article.find({ author: req.user._id }).sort({ createdAt: -1 });
    return successResponse(res, 200, 'Writer articles fetched', { articles });
  } catch (error) {
    next(error);
  }
});

router.get('/articles/:id', protect, async (req, res, next) => {
  try {
    const article = await Article.findOne({ _id: req.params.id, author: req.user._id });
    if (!article) return errorResponse(res, 404, 'Article not found');
    return successResponse(res, 200, 'Article fetched', { article });
  } catch (error) {
    next(error);
  }
});

router.put('/articles/:id', protect, async (req, res, next) => {
  try {
    const article = await Article.findOne({ _id: req.params.id, author: req.user._id });
    if (!article) return errorResponse(res, 404, 'Article not found');
    Object.assign(article, req.body);
    if (req.body.title) {
      article.slug = `${generateSlug(req.body.title)}-${Date.now()}`;
    }
    article.updatedAt = new Date();
    await article.save();
    return successResponse(res, 200, 'Article updated', { article });
  } catch (error) {
    next(error);
  }
});

router.delete('/articles/:id', protect, async (req, res, next) => {
  try {
    const article = await Article.findOne({ _id: req.params.id, author: req.user._id });
    if (!article) return errorResponse(res, 404, 'Article not found');
    await article.deleteOne();
    return successResponse(res, 200, 'Article deleted');
  } catch (error) {
    next(error);
  }
});

router.post('/articles/:id/publish', protect, async (req, res, next) => {
  try {
    const article = await Article.findOne({ _id: req.params.id, author: req.user._id });
    if (!article) return errorResponse(res, 404, 'Article not found');
    const firstPublish = !article.publishedAt;
    article.status = 'published';
    if (firstPublish) {
      article.publishedAt = new Date();
    }
    await article.save();
    if (firstPublish) pushService.notifyArticlePublished(article);
    return successResponse(res, 200, 'Article published', { article });
  } catch (error) {
    next(error);
  }
});

router.post('/articles/:id/unpublish', protect, async (req, res, next) => {
  try {
    const article = await Article.findOne({ _id: req.params.id, author: req.user._id });
    if (!article) return errorResponse(res, 404, 'Article not found');
    article.status = 'draft';
    await article.save();
    return successResponse(res, 200, 'Article unpublished', { article });
  } catch (error) {
    next(error);
  }
});

router.get('/me/earnings', protect, authorize('WRITER'), async (req, res, next) => {
  try {
    const earnings = await WriterEarning.find({ writerId: req.user._id }).sort({ weekStart: -1 });
    return successResponse(res, 200, 'Writer earnings', { earnings });
  } catch (error) {
    next(error);
  }
});

router.get('/me/payouts', protect, authorize('WRITER'), async (req, res, next) => {
  try {
    const payouts = await Payout.find({ writerId: req.user._id }).sort({ requestedAt: -1 });
    return successResponse(res, 200, 'Writer payouts', { payouts });
  } catch (error) {
    next(error);
  }
});

router.get('/me/dashboard', protect, authorize('WRITER'), async (req, res, next) => {
  try {
    const totalArticles = await Article.countDocuments({ author: req.user._id });
    const publishedArticles = await Article.countDocuments({ author: req.user._id, status: 'published' });
    const pendingArticles = await Article.countDocuments({ author: req.user._id, status: { $in: ['draft', 'pending_review', 'approved', 'rejected'] } });
    const totalValidViews = await Article.aggregate([{ $match: { author: req.user._id } }, { $group: { _id: null, total: { $sum: '$validViews' } } }]);
    const thisWeek = getWeekBounds(new Date());
    const weeklyViews = await Article.aggregate([
      { $match: { author: req.user._id, publishedAt: { $gte: thisWeek.weekStart, $lte: thisWeek.weekEnd } } },
      { $group: { _id: null, total: { $sum: '$validViews' } } }
    ]);
    const earnings = await WriterEarning.find({ writerId: req.user._id }).sort({ weekStart: -1 }).limit(5);
    const followersCount = await Follow.countDocuments({ following: req.user._id });
    return successResponse(res, 200, 'Writer dashboard', {
      totalArticles,
      publishedArticles,
      pendingArticles,
      totalValidViews: totalValidViews[0]?.total || 0,
      viewsThisWeek: weeklyViews[0]?.total || 0,
      currentEarnings: earnings.reduce((sum, item) => sum + Number(item.calculatedAmount || 0), 0),
      previousWeeklyEarnings: earnings.slice(1).reduce((sum, item) => sum + Number(item.calculatedAmount || 0), 0),
      topPerformingArticle: null,
      followersCount
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/follow', protect, async (req, res, next) => {
  try {
    let writer = await WriterProfile.findById(req.params.id);
    if (!writer) {
      writer = await WriterProfile.findOne({ user: req.params.id });
    }
    if (!writer) return errorResponse(res, 404, 'Writer not found');
    const follow = await Follow.findOneAndUpdate(
      { follower: req.user._id, writer: writer._id },
      { $setOnInsert: { follower: req.user._id, writer: writer._id } },
      { upsert: true, new: true }
    );
    return successResponse(res, 201, 'Following writer', { follow });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id/follow', protect, async (req, res, next) => {
  try {
    let writer = await WriterProfile.findById(req.params.id);
    if (!writer) {
      writer = await WriterProfile.findOne({ user: req.params.id });
    }
    if (!writer) return errorResponse(res, 404, 'Writer not found');
    await Follow.deleteOne({ follower: req.user._id, writer: writer._id });
    return successResponse(res, 200, 'Unfollowed writer');
  } catch (error) {
    next(error);
  }
});

router.get('/:id/follow/status', protect, async (req, res, next) => {
  try {
    let writer = await WriterProfile.findById(req.params.id);
    if (!writer) {
      writer = await WriterProfile.findOne({ user: req.params.id });
    }
    if (!writer) return errorResponse(res, 404, 'Writer not found');
    const follow = await Follow.findOne({ follower: req.user._id, writer: writer._id });
    return successResponse(res, 200, 'Follow status', { isFollowing: !!follow });
  } catch (error) {
    next(error);
  }
});

router.get('/me/following', protect, async (req, res, next) => {
  try {
    const follows = await Follow.find({ follower: req.user._id }).populate('writer');
    return successResponse(res, 200, 'Following list', { follows });
  } catch (error) {
    next(error);
  }
});

router.post('/articles/:id/like', protect, async (req, res, next) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return errorResponse(res, 404, 'Article not found');
    const existing = await Like.findOne({ article: article._id, user: req.user._id });
    if (existing) return errorResponse(res, 400, 'Already liked this article');
    await Like.create({ article: article._id, user: req.user._id });
    article.likes = Number(article.likes || 0) + 1;
    await article.save();
    return successResponse(res, 200, 'Article liked', { article });
  } catch (error) {
    next(error);
  }
});

router.delete('/articles/:id/like', protect, async (req, res, next) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return errorResponse(res, 404, 'Article not found');
    const existing = await Like.findOne({ article: article._id, user: req.user._id });
    if (!existing) return errorResponse(res, 400, 'Like not found');
    await existing.deleteOne();
    article.likes = Math.max(0, Number(article.likes || 0) - 1);
    await article.save();
    return successResponse(res, 200, 'Like removed');
  } catch (error) {
    next(error);
  }
});

router.post('/articles/:id/bookmark', protect, async (req, res, next) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return errorResponse(res, 404, 'Article not found');
    const bookmark = await Bookmark.findOneAndUpdate(
      { article: article._id, user: req.user._id },
      { $setOnInsert: { article: article._id, user: req.user._id } },
      { upsert: true, new: true }
    );
    return successResponse(res, 200, 'Article bookmarked', { bookmark });
  } catch (error) {
    next(error);
  }
});

router.delete('/articles/:id/bookmark', protect, async (req, res, next) => {
  try {
    await Bookmark.deleteOne({ article: req.params.id, user: req.user._id });
    return successResponse(res, 200, 'Bookmark removed');
  } catch (error) {
    next(error);
  }
});

router.get('/users/me/bookmarks', protect, async (req, res, next) => {
  try {
    const bookmarks = await Bookmark.find({ user: req.user._id }).populate('article');
    return successResponse(res, 200, 'Bookmarks', { bookmarks });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
