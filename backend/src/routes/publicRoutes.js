const express = require('express');
const Category = require('../models/Category');
const Article = require('../models/Article');
const User = require('../models/User');
const { optionalAuth } = require('../middleware/auth');
const { withEngagement } = require('../services/engagementService');
const { categoryIdsFor } = require('../utils/categoryGroups');
const { successResponse, errorResponse } = require('../utils/apiResponse');

const router = express.Router();

router.get('/articles', optionalAuth, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, category, sort = 'latest' } = req.query;
    const filter = { status: 'published' };
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { summary: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }
    // A section asked for by slug has to include the copies stored under the
    // other language, otherwise "Sports" and "Amasport" each hide half the news.
    if (category) {
      const categoryIds = await categoryIdsFor(category);
      if (!categoryIds.length) {
        return successResponse(res, 200, 'Articles fetched', { articles: [], total: 0, page: Number(page), limit: Number(limit) });
      }
      filter.category = { $in: categoryIds };
    }
    let sortOption = { publishedAt: -1 };
    if (sort === 'trending') sortOption = { validViews: -1, likes: -1 };
    else if (sort === 'popular') sortOption = { views: -1 };

    const articles = await Article.find(filter)
      .populate('author', 'fullName username')
      .populate('category', 'name slug')
      .sort(sortOption)
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Article.countDocuments(filter);
    return successResponse(res, 200, 'Articles fetched', { articles: await withEngagement(req.user, articles), total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    next(error);
  }
});

router.get('/articles/:slug', optionalAuth, async (req, res, next) => {
  try {
    const article = await Article.findOne({ slug: req.params.slug, status: 'published' })
      .populate('author', 'fullName username avatar')
      .populate('category', 'name slug');
    if (!article) return errorResponse(res, 404, 'Article not found');
    const [decorated] = await withEngagement(req.user, [article]);
    return successResponse(res, 200, 'Article fetched', { article: decorated });
  } catch (error) {
    next(error);
  }
});

router.get('/latest', async (req, res, next) => {
  try {
    const articles = await Article.find({ status: 'published' })
      .populate('category', 'name slug')
      .sort({ publishedAt: -1 })
      .limit(10);
    return successResponse(res, 200, 'Latest articles', { articles });
  } catch (error) {
    next(error);
  }
});

router.get('/trending', async (req, res, next) => {
  try {
    const articles = await Article.find({ status: 'published' })
      .populate('category', 'name slug')
      .sort({ validViews: -1, likes: -1 })
      .limit(10);
    return successResponse(res, 200, 'Trending articles', { articles });
  } catch (error) {
    next(error);
  }
});

router.get('/popular', async (req, res, next) => {
  try {
    const articles = await Article.find({ status: 'published' })
      .populate('category', 'name slug')
      .sort({ views: -1 })
      .limit(10);
    return successResponse(res, 200, 'Popular articles', { articles });
  } catch (error) {
    next(error);
  }
});

router.get('/categories', async (req, res, next) => {
  try {
    const categories = await Category.find({ isActive: true }).sort({ name: 1 });
    return successResponse(res, 200, 'Categories fetched', { categories });
  } catch (error) {
    next(error);
  }
});

router.get('/categories/:slug', optionalAuth, async (req, res, next) => {
  try {
    const { page = 1, limit = 12, sort = 'latest' } = req.query;
    // Both copies of the section are read, so nothing published under the other
    // spelling disappears from this page, and a section only ever created in one
    // language still opens under its other name.
    const sectionIds = await categoryIdsFor(req.params.slug);
    let category = await Category.findOne({ slug: req.params.slug, isActive: true });
    if (!category && sectionIds.length) category = await Category.findOne({ _id: { $in: sectionIds }, isActive: true });
    if (!category) {
      return successResponse(res, 200, 'Category articles fetched', { category: null, articles: [], total: 0, page: 1, limit });
    }

    let sortOption = { publishedAt: -1 };
    if (sort === 'trending') sortOption = { validViews: -1, likes: -1 };
    else if (sort === 'popular') sortOption = { views: -1 };

    const inSection = { category: { $in: sectionIds.length ? sectionIds : [category._id] }, status: 'published' };

    const articles = await Article.find(inSection)
      .populate('author', 'fullName username avatar')
      .populate('category', 'name slug')
      .sort(sortOption)
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Article.countDocuments(inSection);
    return successResponse(res, 200, 'Category articles fetched', { category, articles: await withEngagement(req.user, articles), total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    next(error);
  }
});

router.get('/search', async (req, res, next) => {
  try {
    const { search = '', page = 1, limit = 20 } = req.query;
    const regex = new RegExp(search, 'i');
    const articles = await Article.find({
      status: 'published',
      $or: [
        { title: regex },
        { summary: regex },
        { content: regex },
        { tags: { $in: [regex] } }
      ]
    }).populate('author', 'fullName username avatar').populate('category', 'name slug').sort({ publishedAt: -1 }).skip((Number(page)-1) * Number(limit)).limit(Number(limit));
    const authors = await User.find({
      $or: [
        { fullName: regex },
        { username: regex },
        { bio: regex }
      ]
    }).select('fullName username avatar bio role').limit(10);
    return successResponse(res, 200, 'Search results', { articles, authors });
  } catch (error) {
    next(error);
  }
});

router.get('/writers/:id', async (req, res, next) => {
  if (req.params.id === 'articles' || req.params.id === 'me' || req.params.id === 'dashboard' || req.params.id === 'earnings' || req.params.id === 'payouts') {
    return next();
  }
  try {
    const writer = await User.findById(req.params.id).select('fullName username bio avatar country language');
    const articles = await Article.find({ author: writer?._id, status: 'published' }).sort({ publishedAt: -1 });
    return successResponse(res, 200, 'Writer details', { writer, articles });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
