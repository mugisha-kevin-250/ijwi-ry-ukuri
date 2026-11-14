const express = require('express');
const mongoose = require('mongoose');
const Article = require('../models/Article');
const Comment = require('../models/Comment');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const workflow = require('../services/articleWorkflow');
const lifecycle = require('../utils/articleLifecycle');
const commentState = require('../utils/commentState');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { plainText, cleanText } = require('../utils/textFields');

const router = express.Router();

// Staff only. A reader or an unapproved writer must not be able to reach a
// queue of other people's stories, and this gate is the only thing between the
// public internet and "publish this".
router.use(protect, authorize('EDITOR', 'ADMIN'));

const LIST_FIELDS = 'title slug summary author category status tags featuredImage language '
  + 'aiGenerated views validViews likes commentsCount readingTime publishedAt scheduledAt '
  + 'createdAt updatedAt reviewNote reviewedAt approvedBy';

function pageOf(query, fallbackLimit) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || fallbackLimit));
  return { page, limit, skip: (page - 1) * limit };
}

// Sorts a review queue. Deliberately short: the queue is small and the wrong
// order just means an editor scrolls further, but a rejected value would throw.
function queueSort(sort) {
  switch (sort) {
    case 'oldest': return { createdAt: 1 };
    case 'newest': return { createdAt: -1 };
    case 'views': return { validViews: -1, createdAt: -1 };
    default: return { createdAt: -1 };
  }
}

// The queue an editor actually works from: paginated, searchable, and readable
// without a second request per story.
router.get('/articles', async (req, res, next) => {
  try {
    const { page, limit, skip } = pageOf(req.query, 20);
    const status = lifecycle.STORY_STATES.includes(req.query.status)
      ? req.query.status
      : 'pending_review';
    const filter = { status };
    const search = plainText(req.query.search, { maxLength: 120 });
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { summary: { $regex: search, $options: 'i' } },
      ];
    }
    const [articles, total, waiting] = await Promise.all([
      Article.find(filter).sort(queueSort(req.query.sort)).skip(skip).limit(limit)
        .select(LIST_FIELDS).populate('author', 'fullName username profileImage').lean(),
      Article.countDocuments(filter),
      Article.countDocuments({ status: 'pending_review' }),
    ]);
    return successResponse(res, 200, 'Review queue fetched', {
      articles, total, page, limit,
      totalPages: Math.ceil(total / limit) || 1,
      status,
      pendingCount: waiting,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/articles/pending', async (req, res, next) => {
  try {
    const articles = await Article.find({ status: 'pending_review' })
      .select(LIST_FIELDS).populate('author', 'fullName username profileImage')
      .sort({ createdAt: -1 }).lean();
    return successResponse(res, 200, 'Pending articles', { articles });
  } catch (error) {
    next(error);
  }
});

// Full text for the story under review. The body is deliberately only here and
// never in the list, so a queue page cannot leak unpublished copy in bulk.
router.get('/articles/:id', async (req, res, next) => {
  try {
    const article = await Article.findById(req.params.id)
      .populate('author', 'fullName username email profileImage')
      .populate('category')
      .populate('approvedBy', 'fullName username role');
    if (!article) return errorResponse(res, 404, 'Article not found');
    return successResponse(res, 200, 'Article fetched', {
      article,
      nextStates: lifecycle.allowedMoves(article.status),
    });
  } catch (error) {
    next(error);
  }
});

// approve / reject / request-correction / publish / unpublish are all the same
// thing: ask the lifecycle whether this story may become that, then record who
// did it. The route only ever supplies the target state.
const DECISIONS = {
  approve: 'approved',
  reject: 'rejected',
  'request-correction': 'rejected',
  publish: 'published',
  unpublish: 'archived',
  archive: 'archived',
  restore: 'published',
  draft: 'draft',
};

async function decide(req, res, next, to) {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return errorResponse(res, 404, 'Article not found');

    const note = cleanText(req.body?.note || req.body?.comment || req.body?.reason, { maxLength: 1000 });

    // A correction request and a flat rejection are the same state but not the
    // same message, so the caller can say which it meant.
    const result = await workflow.moveStory({ article, to, by: req.user, note });
    if (result.error) return errorResponse(res, result.status, result.error);

    return successResponse(res, 200, `Article ${to}`, {
      article: result.article,
      nextStates: lifecycle.allowedMoves(to),
    });
  } catch (error) {
    next(error);
  }
}

Object.entries(DECISIONS).forEach(([verb, state]) => {
  router.put(`/articles/:id/${verb}`, (req, res, next) => decide(req, res, next, state));
  // Writers used a POST for publish and staff screens already call PUT on some
  // of these, so both spellings stay live rather than breaking an old client.
  router.post(`/articles/:id/${verb}`, (req, res, next) => decide(req, res, next, state));
});

// A publish date in the future is the only reason a story sits in "approved"
// until nobody touches it again, so the field has to be settable here or the
// scheduler has nothing to read. Only an approved or draft story can be timed;
// a live story is already past its moment.
router.put('/articles/:id/schedule', async (req, res, next) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return errorResponse(res, 404, 'Article not found');
    if (!['draft', 'approved'].includes(article.status)) {
      return errorResponse(res, 409, `A story that is ${lifecycle.describe(article.status)} cannot be scheduled.`);
    }

    const notReady = lifecycle.publishable(article);
    if (notReady) return errorResponse(res, 422, `This story cannot be scheduled yet: ${notReady}`);

    const raw = req.body?.scheduledAt;
    if (!raw) {
      article.scheduledAt = undefined;
      await article.save();
      return successResponse(res, 200, 'Schedule removed', { article });
    }

    const when = new Date(raw);
    if (Number.isNaN(when.getTime())) return errorResponse(res, 400, 'That is not a date and time');
    if (when.getTime() < Date.now() - 60000) {
      return errorResponse(res, 400, 'Pick a time in the future, or publish the story now');
    }

    article.scheduledAt = when;
    await article.save();
    return successResponse(res, 200, 'Article scheduled', {
      article,
      scheduledAt: article.scheduledAt,
    });
  } catch (error) {
    next(error);
  }
});

// Where a story has been, in the editor's own words. Answers "who approved this
// and when" long after the fact.
router.get('/articles/:id/history', async (req, res, next) => {
  try {
    const article = await Article.findById(req.params.id)
      .select('title status reviewEvents')
      .populate({ path: 'reviewEvents', populate: { path: 'by', select: 'fullName username role' } });
    if (!article) return errorResponse(res, 404, 'Article not found');
    return successResponse(res, 200, 'Article history fetched', {
      articleId: article._id,
      title: article.title,
      status: article.status,
      events: article.reviewEvents || [],
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------- comments ---

const COMMENT_STATES = ['reported', 'active', 'hidden', 'deleted'];

// How many readers flagged a comment, without saying which ones.
function queueRow(comment) {
  const { reportedBy, ...row } = comment;
  return { ...row, reports: (reportedBy || []).length };
}

// The moderation queue. Staff read the same words a reader read, who wrote them
// and how many readers asked for a look. Which readers asked is never returned:
// a flagger must not become a target.
router.get('/comments', async (req, res, next) => {
  try {
    const { page, limit, skip } = pageOf(req.query, 25);
    const status = COMMENT_STATES.includes(req.query.status) ? req.query.status : 'reported';
    const filter = { status };
    if (mongoose.isValidObjectId(String(req.query.article || ''))) {
      filter.article = req.query.article;
    }
    const search = plainText(req.query.search, { maxLength: 120 });
    if (search) filter.content = { $regex: search, $options: 'i' };

    const [rows, total, grouped] = await Promise.all([
      Comment.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('user', 'fullName username role')
        .populate('article', 'title slug status')
        .populate('moderatedBy', 'fullName username role')
        .lean(),
      Comment.countDocuments(filter),
      Comment.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    ]);

    const counts = { active: 0, reported: 0, hidden: 0, deleted: 0 };
    grouped.forEach((row) => {
      if (Object.prototype.hasOwnProperty.call(counts, row._id)) counts[row._id] = row.n;
    });

    return successResponse(res, 200, 'Comments fetched', {
      comments: rows.map(queueRow),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      status,
      counts,
    });
  } catch (error) {
    next(error);
  }
});

// One door with three verbs. A comment is only ever taken away from readers by a
// named human, and the note they leave is the reason a newsroom can give later.
const MODERATION = { hide: 'hidden', restore: 'active', delete: 'deleted' };

router.put('/comments/:id/moderate', async (req, res, next) => {
  try {
    const action = String(req.body?.action || '').toLowerCase();
    const to = MODERATION[action];
    if (!to) return errorResponse(res, 400, 'Choose hide, restore or delete');

    const comment = await Comment.findById(req.params.id);
    if (!comment) return errorResponse(res, 404, 'Comment not found');

    const note = cleanText(req.body?.note, { maxLength: 500 });
    if (comment.status !== to) {
      comment.status = to;
      comment.moderatedBy = req.user._id;
      comment.moderatedAt = new Date();
      if (note) comment.moderationNote = note;
      await comment.save();
    } else if (note) {
      comment.moderationNote = note;
      await comment.save();
    }

    const commentsCount = await commentState.syncCommentCount(comment.article);
    const fresh = await Comment.findById(comment._id)
      .populate('user', 'fullName username role')
      .populate('article', 'title slug status')
      .populate('moderatedBy', 'fullName username role');

    return successResponse(res, 200, `Comment ${to}`, {
      comment: queueRow(fresh.toObject()),
      commentsCount,
    });
  } catch (error) {
    next(error);
  }
});

// Counts for the review badge, so the number shown is the number of stories.
router.get('/stats', async (req, res, next) => {
  try {
    const [pending, approved, rejected, published, reportedComments] = await Promise.all([
      Article.countDocuments({ status: 'pending_review' }),
      Article.countDocuments({ status: 'approved' }),
      Article.countDocuments({ status: 'rejected' }),
      Article.countDocuments({ status: 'published' }),
      Comment.countDocuments({ status: 'reported' }),
    ]);
    const writers = await User.countDocuments({ role: 'WRITER' });
    return successResponse(res, 200, 'Editorial stats', {
      stats: { pending, approved, rejected, published, writers, reportedComments },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
