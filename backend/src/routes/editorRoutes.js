const express = require('express');
const mongoose = require('mongoose');
const Article = require('../models/Article');
const Comment = require('../models/Comment');
const User = require('../models/User');
const { protect, requirePermission } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');
const workflow = require('../services/articleWorkflow');
const lifecycle = require('../utils/articleLifecycle');
const breakingNews = require('../utils/breakingNews');
const storyMedia = require('../services/storyMedia');
const commentState = require('../utils/commentState');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { plainText, cleanText, safeMediaUrl } = require('../utils/textFields');
const auditLog = require('../services/auditLogService');

const router = express.Router();

// The review desk is staff-only, and "staff" here is the matrix's answer rather
// than a name: any role that decides what readers see, edits a live story, or
// answers a reader's comment can reach the desk; the routes on it then ask for
// the one they actually need. A reader or an unapproved writer holds none of
// them and so cannot reach a queue of other people's stories - this gate is what
// stands between the public internet and "publish this".
router.use(protect, requirePermission([PERMISSIONS.review, PERMISSIONS.correct, PERMISSIONS.publish, PERMISSIONS.moderateComments]));

const LIST_FIELDS = 'title slug summary author category status tags featuredImage language '
  + 'aiGenerated views validViews likes commentsCount readingTime publishedAt scheduledAt '
  + 'isBreaking breakingAt '
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
router.get('/articles', requirePermission([PERMISSIONS.review]), async (req, res, next) => {
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

router.get('/articles/pending', requirePermission([PERMISSIONS.review]), async (req, res, next) => {
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
//
// The desk also gets what the reader never sees: the earlier versions of this
// copy, who recorded each source ruling and the note they left. Those paths are
// `select: false` on the model, so asking for them by name is the only way to
// read them.
router.get('/articles/:id', requirePermission([PERMISSIONS.review]), async (req, res, next) => {
  try {
    const article = await Article.findById(req.params.id)
      .select('+revisions +sources.reviewedBy +sources.reviewNote')
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

/**
 * What a story needs after it is live, all of it a desk signature and none of
 * it a rewrite of the copy:
 *
 * - what the photograph says about itself (credit, caption, source link), and
 *   the same two lines under each of the pictures that follow it;
 * - whether an advertiser paid for it, and who did;
 * - a correction, appended with the date and the person who recorded it.
 *
 * The route is separate from the writer's edit endpoint because an editor is
 * not the author, and because a disclosure set by the person who sold the space
 * would not be a disclosure. The story text is untouched, so a published page
 * keeps its address, its comments and its view count.
 */
router.put('/articles/:id/disclosure', requirePermission([PERMISSIONS.correct]), async (req, res, next) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return errorResponse(res, 404, 'Article not found');

    const body = req.body || {};
    const changes = {};

    for (const [field, clean] of [
      ['imageCredit', (value) => plainText(value, { maxLength: 160 })],
      ['imageCaption', (value) => plainText(value, { maxLength: 240 })],
      ['imageSourceUrl', (value) => safeMediaUrl(value)],
    ]) {
      if (body[field] !== undefined) changes[field] = clean(body[field]);
    }

    if (body.isSponsored !== undefined) {
      const wantsSponsored = body.isSponsored === true || body.isSponsored === 'true';
      const sponsor = body.sponsor === undefined ? article.sponsor : plainText(body.sponsor, { maxLength: 120 });
      // Paid copy that does not say who paid is not a disclosure, so the flag
      // and the name arrive together or not at all.
      if (wantsSponsored && !sponsor) {
        return errorResponse(res, 400, 'Say who paid for this story before marking it sponsored');
      }
      changes.isSponsored = wantsSponsored;
      changes.sponsor = wantsSponsored ? sponsor : '';
    } else if (body.sponsor !== undefined) {
      changes.sponsor = plainText(body.sponsor, { maxLength: 120 });
    }

    const note = typeof body.correctionNote === 'string'
      ? plainText(body.correctionNote, { maxLength: 600 })
      : '';
    if (note) {
      // Appended, never edited over: the record has to keep showing what the
      // newsroom said first and what it found out afterwards.
      article.corrections.push({ note, at: new Date(), by: req.user._id });
    }

    // The same two lines, under every picture after the first. An author sends
    // the gallery and the desk approves it, and a borrowed photograph that
    // reaches a reader with nothing under it is the disclosure nobody checked.
    // Only the caption and the credit are written here: the list itself, and
    // where each row points, stay the reporter's.
    let galleryWritten = 0;
    if (body.media !== undefined) {
      const gallery = storyMedia.disclose(body.media);
      if (!gallery.ok) return errorResponse(res, 400, gallery.reason);
      const rows = Array.isArray(article.media) ? article.media : [];
      for (const patch of gallery.patches) {
        // A row the desk named by its id is that row and no other. If it has
        // gone off the story, the line was written for a picture that is not
        // there any more, and dropping it into whatever now sits in that
        // position would hang somebody's credit under the wrong photograph.
        const row = patch.id
          ? rows.find((item) => String(item._id) === patch.id)
          : rows[patch.index];
        if (!row) continue;
        if (patch.caption !== undefined) row.caption = patch.caption;
        if (patch.credit !== undefined) row.credit = patch.credit;
        galleryWritten += 1;
      }
      // A subdocument list is not watched the way a scalar field is, so say that
      // something inside it moved or the save quietly writes nothing at all.
      if (galleryWritten) article.markModified('media');
    }

    Object.assign(article, changes);
    if (!Object.keys(changes).length && !note && !galleryWritten) {
      return errorResponse(res, 400, 'Nothing to record - write a caption, a sponsor or a correction');
    }
    article.updatedAt = new Date();
    await article.save();

    if (note || Object.keys(changes).length || galleryWritten) {
      await auditLog.recordSafely({
        actor: req.user,
        action: note ? 'article.correction_recorded' : 'article.disclosure_updated',
        entityType: 'article',
        entityId: article._id,
        entityLabel: article.title,
        summary: note ? 'A public correction was recorded on an article' : 'Article disclosure or media credits were updated',
        details: { correction: Boolean(note), sponsored: Boolean(changes.isSponsored), galleryRowsUpdated: galleryWritten },
        req,
      });
    }

    return successResponse(res, 200, note ? 'Correction published' : 'Story details updated', { article });
  } catch (error) {
    next(error);
  }
});

/**
 * The breaking flag, on and off.
 *
 * Staff only, and never the author: a story that can call itself breaking is a
 * story where the label costs nothing, and the whole point of the word is that
 * somebody with the desk's judgement spent it here rather than there. The rule
 * and the clock live in utils/breakingNews so the scheduler and this route
 * cannot drift apart on how long yesterday's emergency is allowed to last.
 */
router.put('/articles/:id/breaking', requirePermission([PERMISSIONS.correct, PERMISSIONS.publish]), async (req, res, next) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return errorResponse(res, 404, 'Article not found');

    // No `on` means "toggle", which is what a desk button actually is.
    const sent = req.body?.on;
    const on = sent === undefined ? !article.isBreaking : sent === true || sent === 'true';
    const result = await breakingNews.declare({ Article, article, on, by: req.user._id });
    if (!result.ok) return errorResponse(res, 400, result.reason);

    article.updatedAt = new Date();
    await article.save();
    await auditLog.recordSafely({
      actor: req.user,
      action: result.isBreaking ? 'article.breaking_enabled' : 'article.breaking_disabled',
      entityType: 'article',
      entityId: article._id,
      entityLabel: article.title,
      summary: result.isBreaking ? 'Breaking-news flag enabled' : 'Breaking-news flag disabled',
      details: { isBreaking: result.isBreaking },
      req,
    });

    return successResponse(res, 200, result.isBreaking ? 'Marked as breaking' : 'The breaking label is off', {
      article,
      breaking: await Article.countDocuments({ isBreaking: true, breakingAt: { $gte: new Date(Date.now() - breakingNews.BREAKING_WINDOW_MS) } })
    });
  } catch (error) {
    next(error);
  }
});

/**
 * The desk's ruling on one source.
 *
 * "Verified" is a claim the page makes to a reader, so it can only come from
 * somebody who did not write the story. The note is the reason, and it stays
 * internal: what a reader sees is the status, not the argument behind it.
 *
 * Written with an atomic update rather than by loading the story, because the
 * two fields this sets are `select: false` - a loaded document would not have
 * them, and saving it back could clear a colleague's ruling.
 */
const SOURCE_VERDICTS = ['pending', 'verified', 'rejected'];

router.put('/articles/:id/sources/:sourceId', requirePermission([PERMISSIONS.correct]), async (req, res, next) => {
  try {
    const status = String(req.body?.verificationStatus || '').toLowerCase();
    if (!SOURCE_VERDICTS.includes(status)) {
      return errorResponse(res, 400, 'Choose pending, verified or rejected');
    }
    if (!mongoose.isValidObjectId(String(req.params.sourceId))) {
      return errorResponse(res, 400, 'That is not a source on this story');
    }

    const changes = {
      'sources.$.verificationStatus': status,
      'sources.$.reviewedBy': req.user._id,
    };
    if (req.body?.reviewNote !== undefined) {
      changes['sources.$.reviewNote'] = cleanText(req.body.reviewNote, { maxLength: 400 });
    }

    const updated = await Article.updateOne(
      { _id: req.params.id, 'sources._id': req.params.sourceId },
      { $set: changes },
    );
    if (!updated.matchedCount) return errorResponse(res, 404, 'That source is not on this story');

    const article = await Article.findById(req.params.id)
      .select('+sources.reviewedBy +sources.reviewNote');
    return successResponse(res, 200, `Source ${status}`, {
      sources: article.sources,
      reviewedBy: { _id: req.user._id, fullName: req.user.fullName, role: req.user.role },
    });
  } catch (error) {
    next(error);
  }
});

// A publish date in the future is the only reason a story sits in "approved"
// until nobody touches it again, so the field has to be settable here or the
// scheduler has nothing to read. Only an approved or draft story can be timed;
// a live story is already past its moment.
router.put('/articles/:id/schedule', requirePermission([PERMISSIONS.publish]), async (req, res, next) => {
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
// and when" long after the fact, and "what did the page say before it changed".
router.get('/articles/:id/history', requirePermission([PERMISSIONS.review]), async (req, res, next) => {
  try {
    const article = await Article.findById(req.params.id)
      .select('title status reviewEvents revisions')
      .populate({ path: 'reviewEvents', populate: { path: 'by', select: 'fullName username role' } });
    if (!article) return errorResponse(res, 404, 'Article not found');
    const events = article.reviewEvents || [];
    // The desk can populate a name into the review trail; revisions only ever
    // carry an id, and the queue shows who is looking at the story now, not a
    // roll of every past editor. Resolve them the same way so one screen does not
    // print a raw ObjectId.
    const ids = [...new Set((article.revisions || []).map((r) => r.by).filter(Boolean))];
    const people = await User.find({ _id: { $in: ids } }).select('fullName username role').lean();
    const byId = new Map(people.map((p) => [String(p._id), p]));
    return successResponse(res, 200, 'Article history fetched', {
      articleId: article._id,
      title: article.title,
      status: article.status,
      events,
      // `toObject()` and not a spread: a revision is a Mongoose subdocument, and
      // spreading one copies its internals instead of its words - the desk would
      // get back an object whose headline slot is undefined.
      revisions: (article.revisions || []).map((revision) => ({
        ...revision.toObject(),
        by: byId.get(String(revision.by)) || null,
      })).reverse(),
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
router.get('/comments', requirePermission([PERMISSIONS.review, PERMISSIONS.moderateComments]), async (req, res, next) => {
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

router.put('/comments/:id/moderate', requirePermission([PERMISSIONS.moderateComments]), async (req, res, next) => {
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
router.get('/stats', requirePermission([PERMISSIONS.review]), async (req, res, next) => {
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
