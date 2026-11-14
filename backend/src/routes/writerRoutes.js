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
const WriterWeeklyStat = require('../models/WriterWeeklyStat');
const Payout = require('../models/Payout');
const { protect, authorize } = require('../middleware/auth');
const notificationService = require('../services/notificationService');
const workflow = require('../services/articleWorkflow');
const lifecycle = require('../utils/articleLifecycle');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const generateSlug = require('../utils/generateSlug');
const { getWeekBounds, getWriterEarningsSummary } = require('../services/rewardService');
const {
  pagination,
  sortOption,
  articleFilter,
  buildArticleAnalytics,
  topPublishedArticle,
} = require('../utils/writerAnalytics');
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

// The writer's own shelf: paginated, filterable, searchable - and always fenced
// to author: req.user._id, so no listing can surface another author's story.
router.get('/articles', protect, async (req, res, next) => {
  try {
    const { page, limit, skip } = pagination(req.query);
    const filter = articleFilter(req.user._id, { status: req.query.status, search: req.query.search });
    const [articles, total] = await Promise.all([
      Article.find(filter).sort(sortOption(req.query.sort)).skip(skip).limit(limit).lean(),
      Article.countDocuments(filter),
    ]);
    return successResponse(res, 200, 'Writer articles fetched', {
      articles: articles.map((article) => ({ ...article, actions: workflow.authorActions(article, req.user) })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/articles/:id', protect, async (req, res, next) => {
  try {
    const article = await Article.findOne({ _id: req.params.id, author: req.user._id });
    if (!article) return errorResponse(res, 404, 'Article not found');
    return successResponse(res, 200, 'Article fetched', {
      article,
      actions: workflow.authorActions(article, req.user),
    });
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
    // A story in an editor's hands cannot be rewritten underneath them: the
    // version they are judging has to be the version they sign off. Staff
    // accounts are their own editors, so the lock does not apply to them.
    const staff = ['EDITOR', 'ADMIN'].includes(req.user.role);
    if (!staff && ['pending_review', 'approved'].includes(article.status)) {
      return errorResponse(res, 409, 'This story is in review and cannot be edited. Ask an editor to send it back first.');
    }

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

    // An editor asked for something specific. The next save means the author has
    // answered it, so the story goes back to the queue by itself rather than
    // sitting rejected until the writer finds a button.
    if (article.status === 'rejected') {
      const result = await workflow.moveStory({ article, to: 'pending_review', by: req.user });
      if (result.error) return errorResponse(res, result.status, result.error);
      return successResponse(res, 200, 'Article updated and sent back for review', { article: result.article });
    }
    return successResponse(res, 200, 'Article updated', { article });
  } catch (error) {
    next(error);
  }
});

// Deleting a story the site has already served would leave a dead link in every
// feed and search result that carried it, so a live or in-review story has to be
// taken down by an editor instead.
router.delete('/articles/:id', protect, async (req, res, next) => {
  try {
    const article = await Article.findOne({ _id: req.params.id, author: req.user._id });
    if (!article) return errorResponse(res, 404, 'Article not found');
    if (!workflow.DELETABLE_STATES.includes(article.status)) {
      return errorResponse(res, 409, 'A story that is live or in review cannot be deleted. Unpublish it first.');
    }
    await article.deleteOne();
    return successResponse(res, 200, 'Article deleted');
  } catch (error) {
    next(error);
  }
});

// The author's side of the lifecycle. A writer may send a story to review, take
// back something that has not been read yet, and (for staff accounts) publish
// directly. What they may not do is jump a story that is sitting in front of an
// editor, so that rule lives in the lifecycle, not in the UI.
router.post('/articles/:id/publish', protect, async (req, res, next) => {
  try {
    const article = await workflow.loadOwnStory(req.params.id, req.user._id);
    if (!article) return errorResponse(res, 404, 'Article not found');
    const staff = ['EDITOR', 'ADMIN'].includes(req.user.role);
    if (!staff && article.status !== 'draft') {
      return errorResponse(res, 409, lifecycle.reason(article.status, 'published'));
    }
    const result = await workflow.moveStory({ article, to: 'published', by: req.user });
    if (result.error) return errorResponse(res, result.status, result.error);
    return successResponse(res, 200, result.firstPublish ? 'Article published' : 'Article republished', { article: result.article });
  } catch (error) {
    next(error);
  }
});

// Hand the story to an editor instead of putting it on the site yourself.
router.post('/articles/:id/submit', protect, async (req, res, next) => {
  try {
    const article = await workflow.loadOwnStory(req.params.id, req.user._id);
    if (!article) return errorResponse(res, 404, 'Article not found');
    const notReady = lifecycle.publishable(article);
    if (notReady) return errorResponse(res, 422, `This story is not ready to submit: ${notReady}`);
    const result = await workflow.moveStory({ article, to: 'pending_review', by: req.user });
    if (result.error) return errorResponse(res, result.status, result.error);
    return successResponse(res, 200, 'Article submitted for review', { article: result.article });
  } catch (error) {
    next(error);
  }
});

// Only a story nobody has judged yet can be pulled back; once an editor has
// opened it, taking it away would silently empty their queue.
router.post('/articles/:id/unpublish', protect, async (req, res, next) => {
  try {
    const article = await workflow.loadOwnStory(req.params.id, req.user._id);
    if (!article) return errorResponse(res, 404, 'Article not found');
    if (article.status === 'pending_review') {
      if (workflow.reviewedBySomeoneElse(article, req.user._id)) {
        return errorResponse(res, 409, 'An editor is already reviewing this story, so it cannot be taken back');
      }
    }
    const to = article.status === 'published' ? 'archived' : 'draft';
    const result = await workflow.moveStory({ article, to, by: req.user });
    if (result.error) return errorResponse(res, result.status, result.error);
    return successResponse(res, 200, to === 'archived' ? 'Article unpublished' : 'Article returned to drafts', { article: result.article });
  } catch (error) {
    next(error);
  }
});

// Writers, editors and admins all publish, so all of them have a pay ledger to
// read. These were previously WRITER-only, which made the earnings page throw a
// 403 for staff accounts and leave the UI showing fabricated zeroes.
router.get('/me/earnings', protect, authorize('WRITER', 'EDITOR', 'ADMIN'), async (req, res, next) => {
  try {
    const earnings = await WriterEarning.find({ writerId: req.user._id }).sort({ weekStart: -1 });
    return successResponse(res, 200, 'Writer earnings', { earnings });
  } catch (error) {
    next(error);
  }
});

router.get('/me/payouts', protect, authorize('WRITER', 'EDITOR', 'ADMIN'), async (req, res, next) => {
  try {
    const payouts = await Payout.find({ writerId: req.user._id }).sort({ requestedAt: -1 });
    return successResponse(res, 200, 'Writer payouts', { payouts });
  } catch (error) {
    next(error);
  }
});

router.get('/me/dashboard', protect, authorize('WRITER', 'EDITOR', 'ADMIN'), async (req, res, next) => {
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
    // Money and the top story come from real records, never a summed placeholder.
    const [earnings, topPerformingArticle] = await Promise.all([
      getWriterEarningsSummary(req.user._id),
      topPublishedArticle(req.user._id),
    ]);
    // Follow.writer references a WriterProfile, not the User account.
    const writerProfile = await WriterProfile.findOne({ user: req.user._id }).select('_id');
    const followersCount = writerProfile ? await Follow.countDocuments({ writer: writerProfile._id }) : 0;
    return successResponse(res, 200, 'Writer dashboard', {
      totalArticles,
      publishedArticles,
      pendingArticles,
      totalValidViews: totalValidViews[0]?.total || 0,
      viewsThisWeek: weeklyViews[0]?.total || 0,
      currentEarnings: earnings.currentEarnings,
      previousWeeklyEarnings: earnings.previousWeeklyEarnings,
      totalEarnings: earnings.totalEarnings,
      // null until the pay job has run at least once - the UI reads this to tell
      // "you earned nothing" apart from "the ledger never computed a week".
      lastComputedWeek: earnings.lastComputedWeek,
      rewardRate: earnings.rewardRate,
      minimumPayout: earnings.minimumPayout,
      topPerformingArticle,
      followersCount
    });
  } catch (error) {
    next(error);
  }
});

// Weekly pay history the reward job has already written but nothing exposed:
// one row per computed week, newest first, straight from WriterWeeklyStat.
router.get('/me/weekly-stats', protect, authorize('WRITER'), async (req, res, next) => {
  try {
    const stats = await WriterWeeklyStat.find({ writerId: req.user._id }).sort({ weekStart: -1 }).lean();
    return successResponse(res, 200, 'Writer weekly stats', { stats });
  } catch (error) {
    next(error);
  }
});

// Traffic for the writer's own stories, measured from ArticleView rows. An
// unread article returns an empty series and a null average rather than a zero.
router.get('/me/analytics', protect, async (req, res, next) => {
  try {
    const { page, limit, skip } = pagination(req.query);
    const filter = articleFilter(req.user._id, { status: req.query.status, search: req.query.search });
    const sort = req.query.sort ? sortOption(req.query.sort) : { validViews: -1, createdAt: -1 };
    const [articles, total] = await Promise.all([
      Article.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Article.countDocuments(filter),
    ]);
    const analytics = await buildArticleAnalytics(articles);
    // The actions live on the story rows, not on a separate call: the shelf
    // would otherwise have to ask per row what it is allowed to offer.
    const byId = new Map(articles.map((article) => [String(article._id), article]));
    return successResponse(res, 200, 'Writer article analytics fetched', {
      articles: analytics.map((row) => ({ ...row, actions: workflow.authorActions(byId.get(String(row._id)), req.user) })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    next(error);
  }
});

// Same measurement for one story in the detail view. Ownership is checked in the
// query, so another author's id simply does not exist here.
router.get('/me/analytics/:articleId', protect, async (req, res, next) => {
  try {
    const article = await Article.findOne({ _id: req.params.articleId, author: req.user._id }).lean();
    if (!article) return errorResponse(res, 404, 'Article not found');
    const [analytics] = await buildArticleAnalytics([article]);
    return successResponse(res, 200, 'Writer article analytics fetched', { analytics });
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
