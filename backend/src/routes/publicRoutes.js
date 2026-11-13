const express = require('express');
const Category = require('../models/Category');
const Article = require('../models/Article');
const ContactMessage = require('../models/ContactMessage');
const User = require('../models/User');
const { optionalAuth } = require('../middleware/auth');
const { withEngagement } = require('../services/engagementService');
const { categoryIdsFor, sectionTree, sectionDocFor, sectionPathFor } = require('../utils/categoryGroups');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { cleanText, plainText } = require('../utils/textFields');

const escapeRegex = require('../utils/escapeRegex');

const router = express.Router();

// A reader can type anything into the search box, and every field of a story is
// scanned with it, so the term is treated as plain text and kept short.
function searchPattern(value) {
  return new RegExp(escapeRegex(String(value).slice(0, 80)), 'i');
}

router.get('/articles', optionalAuth, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, category, sort = 'latest' } = req.query;
    const filter = { status: 'published' };
    if (search) {
      const pattern = searchPattern(search);
      filter.$or = [{ title: pattern }, { summary: pattern }, { tags: { $in: [pattern] } }];
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
    return successResponse(res, 200, 'Categories fetched', { categories, sections: await sectionTree() });
  } catch (error) {
    next(error);
  }
});

// The header reads this on its own, without the whole category list.
router.get('/sections', async (req, res, next) => {
  try {
    return successResponse(res, 200, 'Sections fetched', { sections: await sectionTree() });
  } catch (error) {
    next(error);
  }
});

/**
 * A section page: /sports, or one sub-section of it: /sports/football.
 * Asking for a section also asks for everything filed under it, so a story the
 * writer put in Football appears on /sports as well as on its own page.
 */
router.get('/sections/:section/:child?', optionalAuth, async (req, res, next) => {
  try {
    const { page = 1, limit = 12, sort = 'latest' } = req.query;
    const empty = { section: null, child: null, articles: [], total: 0, page: 1, limit: Number(limit) };
    const wanted = String(req.params.section || '').toLowerCase();
    const wantedChild = req.params.child ? String(req.params.child).toLowerCase() : null;

    const tree = await sectionTree();
    const section = tree.find((item) => item.slug === wanted);
    const child = section && wantedChild ? section.children.find((item) => item.slug === wantedChild) : null;
    if (!section || (wantedChild && !child)) {
      return successResponse(res, 200, 'Section articles fetched', empty);
    }

    let sortOption = { publishedAt: -1 };
    if (sort === 'trending') sortOption = { validViews: -1, likes: -1 };
    else if (sort === 'popular') sortOption = { views: -1 };

    const sectionIds = await categoryIdsFor(child ? child.slug : section.slug);
    const filter = { category: { $in: sectionIds }, status: 'published' };
    const [articles, total] = await Promise.all([
      Article.find(filter)
        .populate('author', 'fullName username avatar')
        .populate('category', 'name slug')
        .sort(sortOption)
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit)),
      Article.countDocuments(filter),
    ]);

    return successResponse(res, 200, 'Section articles fetched', {
      section,
      child,
      category: await sectionDocFor(child ? child.slug : section.slug),
      articles: await withEngagement(req.user, articles),
      total,
      page: Number(page),
      limit: Number(limit),
    });
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
    const category = await sectionDocFor(req.params.slug);
    if (!category) {
      return successResponse(res, 200, 'Category articles fetched', { category: null, sectionPath: null, articles: [], total: 0, page: 1, limit });
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
    // The section address is the canonical one; this old /category/<slug> page
    // still works, and tells the reader where the section moved to.
    return successResponse(res, 200, 'Category articles fetched', { category, sectionPath: sectionPathFor(category.slug), articles: await withEngagement(req.user, articles), total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    next(error);
  }
});

router.get('/search', async (req, res, next) => {
  try {
    const { search = '', page = 1, limit = 20 } = req.query;
    const regex = searchPattern(search);
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

const CONTACT_TOPICS = ['correction', 'story-tip', 'advertising', 'writer-access', 'other'];
// Enough of an address to reply to, not an RFC-compliant parser: a wrong one costs
// the reader a bounce letter, and a human-shaped check gives a human-shaped error.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

router.post('/contact', async (req, res, next) => {
  try {
    // Bots fill every field they are given; a person never sees this one. The
    // answer is the same success as a real message, so a crawler cannot learn
    // which field to leave out and come back working.
    if (cleanText(req.body.website, { maxLength: 200 })) {
      return successResponse(res, 201, 'Message received');
    }

    const name = plainText(req.body.name, { maxLength: 120 });
    const email = plainText(req.body.email, { maxLength: 200 }).toLowerCase();
    const message = cleanText(req.body.message, { maxLength: 4000 });
    const topic = CONTACT_TOPICS.includes(req.body.topic) ? req.body.topic : 'other';

    const problems = [];
    if (name.length < 2) problems.push('Please tell us who is writing.');
    if (!EMAIL_SHAPE.test(email)) problems.push('That email address is missing something, so we could not reply to it.');
    if (message.length < 20) problems.push('Please add a little more detail, so the newsroom has something to work with.');
    if (problems.length) return errorResponse(res, 400, problems.join(' '));

    await ContactMessage.create({ name, email, topic, message });
    return successResponse(res, 201, 'Message received');
  } catch (error) {
    next(error);
  }
});

module.exports = router;
