const express = require('express');
const bcrypt = require('bcryptjs');
const Article = require('../models/Article');
const Category = require('../models/Category');
const User = require('../models/User');
const WriterProfile = require('../models/WriterProfile');
const ArticleView = require('../models/ArticleView');
const Bookmark = require('../models/Bookmark');
const Follow = require('../models/Follow');
const WriterEarning = require('../models/WriterEarning');
const Payout = require('../models/Payout');
const { protect, authorize } = require('../middleware/auth');
const notificationService = require('../services/notificationService');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const generateSlug = require('../utils/generateSlug');
const { getWeekBounds } = require('../services/rewardService');
const { plainText, cleanText, cleanTags, safeMediaUrl } = require('../utils/textFields');

const router = express.Router();

router.post('/apply', protect, async (req, res, next) => {
  try {
    const { fullName, username, bio, profileImage, country, language, reasonForWriting } = req.body;
    const existing = await WriterProfile.findOne({ user: req.user._id });
    if (existing) {
      // A rejected writer can ask again; anyone else already has an open application.
      if (existing.status !== 'rejected') {
        return errorResponse(res, 400, 'Application already submitted');
      }
      existing.reasonForWriting = cleanText(reasonForWriting, { maxLength: 1000 }) || existing.reasonForWriting;
      existing.status = 'pending';
      await existing.save();
      req.user.writerStatus = 'pending';
      await req.user.save();
      return successResponse(res, 200, 'Writer application resubmitted', { profile: existing });
    }

    const profile = await WriterProfile.create({
      user: req.user._id,
      fullName: plainText(fullName, { maxLength: 80 }) || req.user.fullName,
      username: plainText(username, { maxLength: 30 }) || req.user.username,
      bio: cleanText(bio, { maxLength: 500 }),
      profileImage: safeMediaUrl(profileImage),
      country: plainText(country, { maxLength: 60 }),
      language: plainText(language, { maxLength: 8 }),
      reasonForWriting: cleanText(reasonForWriting, { maxLength: 1000 }),
      status: 'pending'
    });

    // Applying does not make anyone a writer - an ADMIN has to approve it first,
    // so the account keeps its READER role until then.
    req.user.writerStatus = 'pending';
    req.user.writerProfile = profile._id;
    await req.user.save();

    return successResponse(res, 201, 'Writer application submitted', { profile });
  } catch (error) {
    next(error);
  }
});

// Lets the writer area show the truth about where the reader stands.
// Under /me because GET /api/writers/:id already belongs to the public directory.
router.get('/me/status', protect, async (req, res, next) => {
  try {
    const profile = await WriterProfile.findOne({ user: req.user._id }).select('status createdAt updatedAt');
    return successResponse(res, 200, 'Writer status', {
      role: req.user.role,
      writerStatus: req.user.writerStatus,
      application: profile || null
    });
  } catch (error) {
    next(error);
  }
});

router.post('/articles', protect, authorize('WRITER', 'EDITOR', 'ADMIN'), async (req, res, next) => {
  try {
    const { title, summary, content, category, tags = [], featuredImage } = req.body;
    if (!title || !summary || !content || !category) {
      return errorResponse(res, 400, 'Title, summary, content and category are required');
    }

    // Cleaning happens after the presence check so an all-markup title is
    // refused as missing rather than stored as an empty headline.
    const story = {
      title: plainText(title, { maxLength: 200 }),
      summary: cleanText(summary, { maxLength: 600 }),
      content: cleanText(content, { maxLength: 60000 }),
      featuredImage: safeMediaUrl(featuredImage),
      tags: cleanTags(tags)
    };
    if (!story.title || !story.summary || !story.content) {
      return errorResponse(res, 400, 'Title, summary and content have to say something');
    }

    const categoryDoc = await Category.findById(category);
    if (!categoryDoc) {
      return errorResponse(res, 404, 'Category not found');
    }

    const article = await Article.create({
      ...story,
      slug: `${generateSlug(story.title)}-${Date.now()}`,
      author: req.user._id,
      category: categoryDoc._id,
      status: 'draft'
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

// A writer owns the text of their story and nothing else. Everything that moves
// money (validViews, earnings), decides review (status, publishedAt) or claims
// authorship has to be set by the review endpoints or by an admin, never by the
// body of this request.
const WRITER_EDITABLE_FIELDS = ['title', 'summary', 'content', 'category', 'featuredImage', 'tags', 'language'];

// Each editable field is cleaned the way readers will see it: a headline has to
// stay one plain line, the body keeps its paragraphs, an image stays a link.
const STORY_CLEANERS = {
  title: (value) => plainText(value, { maxLength: 200 }),
  summary: (value) => cleanText(value, { maxLength: 600 }),
  content: (value) => cleanText(value, { maxLength: 60000 }),
  featuredImage: (value) => safeMediaUrl(value),
  tags: (value) => cleanTags(value),
  language: (value) => plainText(value, { maxLength: 8 })
};

// Fields that a story cannot be shown without, so an edit that empties one of
// them is refused instead of silently blanking the headline in every card.
const REQUIRED_STORY_FIELDS = ['title', 'summary', 'content'];

router.put('/articles/:id', protect, async (req, res, next) => {
  try {
    const article = await Article.findOne({ _id: req.params.id, author: req.user._id });
    if (!article) return errorResponse(res, 404, 'Article not found');
    const wasPublished = article.status === 'published';

    const changes = {};
    for (const field of WRITER_EDITABLE_FIELDS) {
      if (req.body[field] === undefined) continue;
      const cleaned = STORY_CLEANERS[field] ? STORY_CLEANERS[field](req.body[field]) : req.body[field];
      if (!cleaned && REQUIRED_STORY_FIELDS.includes(field)) {
        return errorResponse(res, 400, `The ${field} has to say something`);
      }
      changes[field] = cleaned;
    }

    Object.assign(article, changes);
    if (changes.title) {
      article.slug = `${generateSlug(changes.title)}-${Date.now()}`;
    }
    article.updatedAt = new Date();
    await article.save();
    if (!wasPublished && article.status === 'published') {
      await notificationService.announceArticlePublished(article);
    }
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
    if (firstPublish) await notificationService.announceArticlePublished(article);
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
    // Follow.writer references a WriterProfile, not the User account.
    const writerProfile = await WriterProfile.findOne({ user: req.user._id }).select('_id');
    const followersCount = writerProfile ? await Follow.countDocuments({ writer: writerProfile._id }) : 0;
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
