const express = require('express');
const Article = require('../models/Article');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const notificationService = require('../services/notificationService');
const { successResponse, errorResponse } = require('../utils/apiResponse');

const router = express.Router();

router.use(protect, authorize('EDITOR', 'ADMIN'));

router.get('/articles/pending', async (req, res, next) => {
  try {
    const articles = await Article.find({ status: 'pending_review' }).populate('author', 'fullName username').sort({ createdAt: -1 });
    return successResponse(res, 200, 'Pending articles', { articles });
  } catch (error) {
    next(error);
  }
});

router.put('/articles/:id/approve', async (req, res, next) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return errorResponse(res, 404, 'Article not found');
    article.status = 'approved';
    await article.save();
    return successResponse(res, 200, 'Article approved', { article });
  } catch (error) {
    next(error);
  }
});

router.put('/articles/:id/reject', async (req, res, next) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return errorResponse(res, 404, 'Article not found');
    article.status = 'rejected';
    await article.save();
    return successResponse(res, 200, 'Article rejected', { article });
  } catch (error) {
    next(error);
  }
});

router.put('/articles/:id/request-correction', async (req, res, next) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return errorResponse(res, 404, 'Article not found');
    article.status = 'rejected';
    await article.save();
    return successResponse(res, 200, 'Correction requested', { article });
  } catch (error) {
    next(error);
  }
});

router.put('/articles/:id/publish', async (req, res, next) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return errorResponse(res, 404, 'Article not found');
    const firstPublish = article.status !== 'published';
    article.status = 'published';
    article.publishedAt = new Date();
    await article.save();
    if (firstPublish) await notificationService.announceArticlePublished(article);
    return successResponse(res, 200, 'Article published', { article });
  } catch (error) {
    next(error);
  }
});

router.put('/articles/:id/unpublish', async (req, res, next) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return errorResponse(res, 404, 'Article not found');
    article.status = 'archived';
    await article.save();
    return successResponse(res, 200, 'Article unpublished', { article });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
