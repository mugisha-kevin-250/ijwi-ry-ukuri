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

// `likes` is a denormalised cache, so it is always rewritten from the Like rows
// themselves: two taps that arrive together would otherwise both increment from
// the same stale read and leave the counter above the number of readers who
// actually liked the story.
async function likeCountFor(articleId) {
  const likes = await Like.countDocuments({ article: articleId });
  await Article.updateOne({ _id: articleId }, { $set: { likes } });
  return likes;
}

router.post('/:id/like', protect, async (req, res, next) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return errorResponse(res, 404, 'Article not found');
    // Upsert with $setOnInsert: liking twice is a no-op, never a second like.
    await Like.findOneAndUpdate(
      { article: article._id, user: req.user._id },
      { $setOnInsert: { article: article._id, user: req.user._id } },
      { upsert: true }
    );
    return successResponse(res, 200, 'Liked', { liked: true, likes: await likeCountFor(article._id) });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id/like', protect, async (req, res, next) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return errorResponse(res, 404, 'Article not found');
    await Like.deleteMany({ article: article._id, user: req.user._id });
    return successResponse(res, 200, 'Like removed', { liked: false, likes: await likeCountFor(article._id) });
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
    const readingDurationMs = Math.min(Math.max(0, Number(req.body.readingDurationMs || 0)), 2 * 60 * 60 * 1000);
    const forwardedFor = req.headers['x-forwarded-for'];
    const ip = String(Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor || '')
      .split(',')[0]
      .trim() || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';

    const result = await calculateValidView({
      articleId: article._id,
      userId,
      anonymousSessionId,
      ip,
      userAgent,
      readingDurationMs
    });

    let countersChanged = false;
    if (result.countView) {
      article.views = Number(article.views || 0) + 1;
      countersChanged = true;
    }
    if (result.isValid) {
      article.validViews = Number(article.validViews || 0) + 1;
      countersChanged = true;
    }
    if (result.uniqueView) {
      article.uniqueViews = Number(article.uniqueViews || 0) + 1;
      countersChanged = true;
    }
    if (countersChanged) await article.save();

    return successResponse(res, 200, 'View processed', {
      result,
      views: Number(article.views || 0),
      validViews: Number(article.validViews || 0),
      uniqueViews: Number(article.uniqueViews || 0)
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
