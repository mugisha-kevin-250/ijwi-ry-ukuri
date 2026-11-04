const express = require('express');
const Article = require('../models/Article');
const Comment = require('../models/Comment');
const Report = require('../models/Report');
const Like = require('../models/Like');
const Bookmark = require('../models/Bookmark');
const ArticleView = require('../models/ArticleView');
const { protect, optionalAuth, authorize } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { calculateValidView } = require('../services/validViewService');

const router = express.Router();

router.get('/:id/comments', async (req, res, next) => {
  try {
    const comments = await Comment.find({ article: req.params.id, status: 'active' }).populate('user', 'fullName username');
    return successResponse(res, 200, 'Comments fetched', { comments });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/comments', protect, async (req, res, next) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return errorResponse(res, 404, 'Article not found');
    const comment = await Comment.create({
      article: article._id,
      user: req.user._id,
      content: req.body.content
    });
    article.commentsCount = Number(article.commentsCount || 0) + 1;
    await article.save();
    return successResponse(res, 201, 'Comment created', { comment });
  } catch (error) {
    next(error);
  }
});

router.put('/comments/:id', protect, async (req, res, next) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) return errorResponse(res, 404, 'Comment not found');
    if (comment.user.toString() !== req.user._id.toString() && req.user.role !== 'ADMIN' && req.user.role !== 'EDITOR') {
      return errorResponse(res, 403, 'Unauthorized');
    }
    comment.content = req.body.content || comment.content;
    await comment.save();
    return successResponse(res, 200, 'Comment updated', { comment });
  } catch (error) {
    next(error);
  }
});

router.delete('/comments/:id', protect, async (req, res, next) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) return errorResponse(res, 404, 'Comment not found');
    if (comment.user.toString() !== req.user._id.toString() && req.user.role !== 'ADMIN' && req.user.role !== 'EDITOR') {
      return errorResponse(res, 403, 'Unauthorized');
    }
    comment.status = 'deleted';
    await comment.save();
    return successResponse(res, 200, 'Comment deleted');
  } catch (error) {
    next(error);
  }
});

router.post('/:id/like', protect, async (req, res, next) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return errorResponse(res, 404, 'Article not found');
    const existing = await Like.findOne({ article: article._id, user: req.user._id });
    if (existing) return errorResponse(res, 400, 'Already liked');
    await Like.create({ article: article._id, user: req.user._id });
    article.likes = Number(article.likes || 0) + 1;
    await article.save();
    return successResponse(res, 200, 'Liked', { article });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id/like', protect, async (req, res, next) => {
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

router.post('/:id/bookmark', protect, async (req, res, next) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return errorResponse(res, 404, 'Article not found');
    const saved = await Bookmark.findOneAndUpdate(
      { article: article._id, user: req.user._id },
      { $setOnInsert: { article: article._id, user: req.user._id } },
      { upsert: true, new: true }
    );
    return successResponse(res, 200, 'Bookmarked', { bookmark: saved });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id/bookmark', protect, async (req, res, next) => {
  try {
    await Bookmark.deleteOne({ article: req.params.id, user: req.user._id });
    return successResponse(res, 200, 'Bookmark removed');
  } catch (error) {
    next(error);
  }
});

router.post('/:id/report', protect, async (req, res, next) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return errorResponse(res, 404, 'Article not found');
    const report = await Report.create({
      article: article._id,
      reporter: req.user._id,
      reason: req.body.reason,
      details: req.body.details
    });
    return successResponse(res, 201, 'Report submitted', { report });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/view', optionalAuth, async (req, res, next) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return errorResponse(res, 404, 'Article not found');

    const userId = req.user ? req.user._id : null;
    const anonymousSessionId = req.body.anonymousSessionId || req.headers['x-session-id'] || null;
    const readingDurationMs = Number(req.body.readingDurationMs || 0);
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';

    const result = await calculateValidView({
      articleId: article._id,
      userId,
      anonymousSessionId,
      ip,
      userAgent,
      readingDurationMs
    });

    if (result.isValid) {
      article.views = Number(article.views || 0) + 1;
      article.validViews = Number(article.validViews || 0) + 1;
      article.uniqueViews = Number(article.uniqueViews || 0) + 1;
      await article.save();
    }

    return successResponse(res, 200, 'View processed', { result });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
