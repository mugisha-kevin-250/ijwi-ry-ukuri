const express = require('express');
const Article = require('../models/Article');
const User = require('../models/User');
const WriterEarning = require('../models/WriterEarning');
const Payout = require('../models/Payout');
const Category = require('../models/Category');
const ContactMessage = require('../models/ContactMessage');
const WriterProfile = require('../models/WriterProfile');
const PlatformSetting = require('../models/PlatformSetting');
const AiResearchChat = require('../models/AiResearchChat');
const { protect, authorize } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const notificationService = require('../services/notificationService');
const geminiService = require('../services/geminiService');
const aiPhotoService = require('../services/aiPhotoService');
const categoryService = require('../services/categoryService');
const adService = require('../services/adService');
const { publicHttpsUrl } = require('../services/urlGuard');
const radioService = require('../services/radioService');
const storyVideo = require('../services/storyVideo');
const trendService = require('../services/trendService');
const generateSlug = require('../utils/generateSlug');
const lifecycle = require('../utils/articleLifecycle');
const workflow = require('../services/articleWorkflow');
const escapeRegex = require('../utils/escapeRegex');
const { plainText, cleanText, cleanTags, safeMediaUrl } = require('../utils/textFields');

const router = express.Router();

const USER_ROLES = ['READER', 'WRITER', 'EDITOR', 'ADMIN'];
const WRITER_STATES = ['pending', 'approved', 'rejected', 'suspended'];

router.use(protect, authorize('ADMIN', 'EDITOR'));

router.get('/dashboard', async (req, res, next) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalReaders = await User.countDocuments({ role: 'READER' });
    const totalWriters = await User.countDocuments({ role: 'WRITER' });
    const totalEditors = await User.countDocuments({ role: 'EDITOR' });
    const publishedArticles = await Article.countDocuments({ status: 'published' });
    const pendingArticles = await Article.countDocuments({ status: 'pending_review' });
    const rejectedArticles = await Article.countDocuments({ status: 'rejected' });
    const totalViews = await Article.aggregate([{ $group: { _id: null, total: { $sum: '$views' } } }]);
    const validViews = await Article.aggregate([{ $group: { _id: null, total: { $sum: '$validViews' } } }]);
    const pendingEarnings = await WriterEarning.countDocuments({ status: 'pending' });
    const pendingPayouts = await Payout.countDocuments({ status: 'pending' });
    const totalPaidAmount = await Payout.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [viewsThisWeek, viewsThisMonth, topArticles, topWriters] = await Promise.all([
      Article.aggregate([
        { $match: { status: 'published', publishedAt: { $gte: sevenDaysAgo } } },
        { $group: { _id: null, total: { $sum: '$views' } } }
      ]),
      Article.aggregate([
        { $match: { status: 'published', publishedAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: null, total: { $sum: '$views' } } }
      ]),
      Article.find({ status: 'published' })
        .sort({ views: -1, validViews: -1, publishedAt: -1 })
        .limit(10)
        .select('-content')
        .populate('author', 'fullName username avatar')
        .populate('category', 'name slug')
        .lean(),
      Article.aggregate([
        { $match: { status: 'published' } },
        { $group: { _id: '$author', articles: { $sum: 1 }, views: { $sum: '$views' } } },
        { $sort: { views: -1 } },
        { $limit: 10 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 1, fullName: '$user.fullName', username: '$user.username', avatar: '$user.avatar', articles: 1, views: 1 } }
      ])
    ]);

    return successResponse(res, 200, 'Admin dashboard', {
      totalUsers,
      totalReaders,
      totalWriters,
      totalEditors,
      publishedArticles,
      pendingArticles,
      rejectedArticles,
      totalViews: totalViews[0]?.total || 0,
      validViews: validViews[0]?.total || 0,
      viewsThisWeek: viewsThisWeek[0]?.total || 0,
      viewsThisMonth: viewsThisMonth[0]?.total || 0,
      topArticles,
      topWriters,
      pendingEarnings,
      pendingPayouts,
      totalPaidAmount: totalPaidAmount[0]?.total || 0
    });
  } catch (error) {
    next(error);
  }
});

router.get('/users', async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const { role, search } = req.query;

    const match = {};
    if (role) match.role = String(role).toUpperCase();
    if (search) {
      const pattern = new RegExp(escapeRegex(search), 'i');
      match.$or = [{ fullName: pattern }, { username: pattern }, { email: pattern }];
    }

    const [users, total] = await Promise.all([
      User.find(match).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      User.countDocuments(match)
    ]);

    const ids = users.map((user) => user._id);
    const stats = await Article.aggregate([
      { $match: { author: { $in: ids } } },
      { $group: { _id: '$author', articles: { $sum: 1 }, views: { $sum: '$views' }, published: { $sum: { $cond: [{ $eq: ['$status', 'published'] }, 1, 0] } } } }
    ]);
    const statsMap = new Map(stats.map((item) => [String(item._id), item]));

    return successResponse(res, 200, 'Users', {
      users: users.map((user) => ({
        ...user,
        articleCount: statsMap.get(String(user._id))?.articles || 0,
        publishedCount: statsMap.get(String(user._id))?.published || 0,
        totalViews: statsMap.get(String(user._id))?.views || 0
      })),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1
    });
  } catch (error) {
    next(error);
  }
});

router.get('/users/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).lean();
    if (!user) return errorResponse(res, 404, 'User not found');

    const articles = await Article.find({ author: user._id })
      .sort({ createdAt: -1 })
      .select('-content')
      .populate('category', 'name slug')
      .lean();

    const stats = articles.reduce(
      (acc, article) => {
        acc.views += article.views || 0;
        acc.likes += article.likes || 0;
        if (article.status === 'published') acc.published += 1;
        if (article.status === 'pending_review') acc.pending += 1;
        return acc;
      },
      { views: 0, likes: 0, published: 0, pending: 0 }
    );

    return successResponse(res, 200, 'User details', { user, articles, stats, totalArticles: articles.length });
  } catch (error) {
    next(error);
  }
});

router.put('/users/:id', protect, authorize('ADMIN'), async (req, res, next) => {
  try {
    if (String(req.params.id) === String(req.user._id) && req.body.role && req.body.role !== 'ADMIN') {
      return errorResponse(res, 400, 'You cannot remove your own admin role');
    }
    if (String(req.params.id) === String(req.user._id) && req.body.isActive === false) {
      return errorResponse(res, 400, 'You cannot deactivate your own account');
    }

    const allowed = {};
    if (req.body.role) {
      const role = String(req.body.role).toUpperCase();
      if (!USER_ROLES.includes(role)) return errorResponse(res, 400, 'Unknown role');
      allowed.role = role;
    }
    if (typeof req.body.isActive === 'boolean') allowed.isActive = req.body.isActive;
    if (req.body.writerStatus) {
      const writerStatus = String(req.body.writerStatus);
      if (!WRITER_STATES.includes(writerStatus)) return errorResponse(res, 400, 'Unknown writer status');
      allowed.writerStatus = writerStatus;
    }
    if (!Object.keys(allowed).length) return errorResponse(res, 400, 'Nothing to update');

    const user = await User.findByIdAndUpdate(req.params.id, { $set: allowed }, { new: true, runValidators: true }).lean();
    if (!user) return errorResponse(res, 404, 'User not found');
    return successResponse(res, 200, 'User updated', { user });
  } catch (error) {
    next(error);
  }
});

// Applications sit in WriterProfile with status 'pending'; the account itself is
// still a READER until an ADMIN approves it here.
router.get('/writer-requests', async (req, res, next) => {
  try {
    const status = req.query.status === 'all'
      ? null
      : (WRITER_STATES.includes(req.query.status) ? req.query.status : 'pending');
    const profiles = await WriterProfile.find(status ? { status } : {})
      .sort({ createdAt: -1 })
      .populate({ path: 'user', select: 'fullName username email avatar country role writerStatus isActive createdAt' })
      .lean();

    return successResponse(res, 200, 'Writer applications', {
      applications: profiles.filter((profile) => profile.user),
      pendingCount: status === 'pending'
        ? profiles.length
        : await WriterProfile.countDocuments({ status: 'pending' })
    });
  } catch (error) {
    next(error);
  }
});

router.post('/writer-requests/:id/approve', authorize('ADMIN'), async (req, res, next) => {
  try {
    const profile = await WriterProfile.findById(req.params.id);
    if (!profile) return errorResponse(res, 404, 'Application not found');
    const user = await User.findById(profile.user);
    if (!user) return errorResponse(res, 404, 'Applicant account is gone');

    profile.status = 'approved';
    await profile.save();

    // Never demote an EDITOR or ADMIN who happened to apply.
    if (user.role === 'READER') user.role = 'WRITER';
    user.writerStatus = 'approved';
    user.writerProfile = profile._id;
    await user.save();

    return successResponse(res, 200, 'Writer approved', { user: user.toObject({ virtuals: false }), profile });
  } catch (error) {
    next(error);
  }
});

router.post('/writer-requests/:id/reject', authorize('ADMIN'), async (req, res, next) => {
  try {
    const profile = await WriterProfile.findById(req.params.id);
    if (!profile) return errorResponse(res, 404, 'Application not found');

    profile.status = 'rejected';
    await profile.save();

    const user = await User.findById(profile.user);
    if (user) {
      // A writer who was already approved keeps working; only the application closes.
      user.writerStatus = 'rejected';
      await user.save();
      return successResponse(res, 200, 'Writer application rejected', { user, profile });
    }
    return successResponse(res, 200, 'Writer application rejected', { profile });
  } catch (error) {
    next(error);
  }
});

router.get('/articles', async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const { status, category, search } = req.query;
    const sortKey = req.query.sort === 'latest' ? 'createdAt' : req.query.sort === 'oldest' ? 'createdAt' : 'views';
    const direction = req.query.sort === 'oldest' ? 1 : -1;

    const match = {};
    if (status) match.status = status;
    if (search) {
      const pattern = new RegExp(escapeRegex(search), 'i');
      match.$or = [{ title: pattern }, { summary: pattern }, { tags: pattern }];
    }
    if (category) {
      const found = await Category.findOne({
        $or: [{ slug: category }, { name: category }],
      }).select('_id');
      if (found) match.category = found._id;
    }

    const [articles, total] = await Promise.all([
      Article.find(match)
        .sort({ [sortKey]: direction, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('-content')
        .populate('author', 'fullName username avatar')
        .populate('category', 'name slug')
        .lean(),
      Article.countDocuments(match)
    ]);

    return successResponse(res, 200, 'Articles', { articles, total, page, limit, pages: Math.ceil(total / limit) || 1 });
  } catch (error) {
    next(error);
  }
});

// An admin can put a story anywhere in the lifecycle, but only by moving it
// along a legal step. This route used to write any state directly, which is how
// a draft could become "live" with no review and no publishedAt to explain it.
router.put('/articles/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!lifecycle.STORY_STATES.includes(status)) {
      return errorResponse(res, 400, `A story cannot be "${status}". It is one of: ${lifecycle.STORY_STATES.join(', ')}.`);
    }

    const article = await Article.findById(req.params.id);
    if (!article) return errorResponse(res, 404, 'Article not found');

    const result = await workflow.moveStory({ article, to: status, by: req.user, note: req.body.note });
    if (result.error) return errorResponse(res, result.status, result.error);

    const populated = await result.article.populate([
      { path: 'author', select: 'fullName username avatar' },
      { path: 'category', select: 'name slug' }
    ]);
    return successResponse(res, 200, 'Article status updated', {
      article: populated,
      nextStates: lifecycle.allowedMoves(status),
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/articles/:id', protect, authorize('ADMIN'), async (req, res, next) => {
  try {
    const article = await Article.findByIdAndDelete(req.params.id);
    if (!article) return errorResponse(res, 404, 'Article not found');
    return successResponse(res, 200, 'Article deleted', { article });
  } catch (error) {
    next(error);
  }
});

router.get('/earnings', async (req, res, next) => {
  try {
    const earnings = await WriterEarning.find({}).populate('writerId', 'fullName username');
    return successResponse(res, 200, 'Earnings', { earnings });
  } catch (error) {
    next(error);
  }
});

router.get('/payouts', async (req, res, next) => {
  try {
    const payouts = await Payout.find({}).populate('writerId', 'fullName username');
    return successResponse(res, 200, 'Payouts', { payouts });
  } catch (error) {
    next(error);
  }
});

router.put('/payouts/:id/approve', async (req, res, next) => {
  try {
    const payout = await Payout.findById(req.params.id);
    if (!payout) return errorResponse(res, 404, 'Payout not found');
    payout.status = 'approved';
    payout.approvedAt = new Date();
    await payout.save();
    return successResponse(res, 200, 'Payout approved', { payout });
  } catch (error) {
    next(error);
  }
});

router.put('/payouts/:id/reject', async (req, res, next) => {
  try {
    const payout = await Payout.findById(req.params.id);
    if (!payout) return errorResponse(res, 404, 'Payout not found');
    payout.status = 'rejected';
    payout.rejectionReason = plainText(req.body.rejectionReason, { maxLength: 300 }) || 'Rejected by administrator';
    await payout.save();
    return successResponse(res, 200, 'Payout rejected', { payout });
  } catch (error) {
    next(error);
  }
});

router.put('/payouts/:id/mark-paid', async (req, res, next) => {
  try {
    const payout = await Payout.findById(req.params.id);
    if (!payout) return errorResponse(res, 404, 'Payout not found');
    payout.status = 'paid';
    payout.paidAt = new Date();
    await payout.save();
    return successResponse(res, 200, 'Payout marked paid', { payout });
  } catch (error) {
    next(error);
  }
});

router.get('/settings', async (req, res, next) => {
  try {
    const settings = await PlatformSetting.find({});
    return successResponse(res, 200, 'Platform settings', { settings });
  } catch (error) {
    next(error);
  }
});

router.post('/settings', async (req, res, next) => {
  try {
    const { key, value } = req.body;
    const setting = await PlatformSetting.findOneAndUpdate(
      { key },
      { $set: { key, value } },
      { upsert: true, new: true }
    );
    return successResponse(res, 201, 'Setting saved', { setting });
  } catch (error) {
    next(error);
  }
});

async function isAutoPublishOn() {
  const setting = await PlatformSetting.findOne({ key: 'aiAutoPublish' });
  return setting?.value === true || setting?.value === 'true';
}

// Gemini only ever answers the admin portal, and nothing it writes reaches a
// reader without either this switch or the admin's own click.
router.get('/ai/status', authorize('ADMIN'), async (req, res, next) => {
  try {
    return successResponse(res, 200, 'AI writer status', {
      configured: geminiService.isConfigured(),
      model: geminiService.activeModel(),
      autoPublish: await isAutoPublishOn()
    });
  } catch (error) {
    next(error);
  }
});

router.put('/ai/auto-publish', authorize('ADMIN'), async (req, res, next) => {
  try {
    const enabled = req.body?.enabled === true || req.body?.enabled === 'true';
    await PlatformSetting.findOneAndUpdate(
      { key: 'aiAutoPublish' },
      { $set: { key: 'aiAutoPublish', value: enabled, description: 'Publish AI-drafted stories without waiting for the admin' } },
      { upsert: true, new: true }
    );
    return successResponse(res, 200, enabled ? 'AI stories will publish at once' : 'AI stories will wait for review', { autoPublish: enabled });
  } catch (error) {
    next(error);
  }
});

// Produces a story and hands it back for the admin to read. Nothing is stored
// or published here - that only happens through POST /ai/articles below.
router.post('/ai/generate', authorize('ADMIN'), async (req, res, next) => {
  try {
    const { topic, angle, audience } = req.body || {};
    if (!topic || String(topic).trim().length < 6) {
      return errorResponse(res, 400, 'Describe the topic the story should cover');
    }
    const story = await geminiService.writeStory({
      topic: plainText(topic, { maxLength: 500 }),
      angle: angle ? plainText(angle, { maxLength: 500 }) : '',
      audience: audience === 'world' ? 'world' : 'rwanda'
    });
    return successResponse(res, 200, 'Draft ready for review', story);
  } catch (error) {
    if (error.code === 'AI_NOT_CONFIGURED') return errorResponse(res, 503, error.message);
    if (String(error.code || '').startsWith('AI_')) return errorResponse(res, 502, error.message);
    next(error);
  }
});

// The trends analyzer: a topic only exists here if Google's feed really named
// it, so the evidence in the prompt is fetched data rather than typed guesswork.
router.post('/ai/trends', authorize('ADMIN'), async (req, res, next) => {
  try {
    const { geo, topic, angle, audience } = req.body || {};
    if (!geo || !topic) return errorResponse(res, 400, 'Choose a trending topic from the list first');

    const evidence = await trendService.evidenceFor(geo, topic);
    if (!evidence) {
      return errorResponse(res, 400, 'Google did not report that topic to this server. Refresh the trending list and pick one of the topics it shows.');
    }

    const story = await geminiService.writeStory({
      topic: evidence.topic,
      angle: angle ? plainText(angle, { maxLength: 500 }) : '',
      audience: audience === 'world' ? 'world' : 'rwanda',
      region: evidence.region,
      evidence: evidence.headlines
    });
    // The picture is the one the feed printed next to the headline and the name
    // is the publisher Google credited, so a trend story can carry its source
    // image without anyone guessing at one.
    return successResponse(res, 200, 'Trend draft ready for review', {
      ...story,
      evidence,
      photo: trendService.photoCreditFor(evidence),
      destination: '/trending'
    });
  } catch (error) {
    if (error.code === 'AI_NOT_CONFIGURED') return errorResponse(res, 503, error.message);
    if (String(error.code || '').startsWith('AI_')) return errorResponse(res, 502, error.message);
    next(error);
  }
});

/**
 * The research desk an admin talks to.
 *
 * This is the one place on the site where a machine is allowed to answer
 * questions rather than draft a story, and it is kept apart from publishing on
 * purpose: nothing said here can become an article without a person writing it
 * out. The thread is stored on the server so the questions survive a closed
 * laptop, and so the model is sent the earlier turns instead of answering a
 * follow-up as if it were the first one.
 */
const CHAT_TURNS_KEPT = 40;

router.get('/ai/chat', authorize('ADMIN'), async (req, res, next) => {
  try {
    const thread = await AiResearchChat.findOne({ owner: req.user._id });
    return successResponse(res, 200, 'Research thread', {
      configured: geminiService.isConfigured(),
      model: geminiService.activeModel(),
      turns: thread?.turns || []
    });
  } catch (error) {
    next(error);
  }
});

router.post('/ai/chat', authorize('ADMIN'), async (req, res, next) => {
  try {
    const question = plainText(req.body?.message, { maxLength: 4000 });
    if (question.trim().length < 3) return errorResponse(res, 400, 'Ask the research desk a question first');

    const thread = (await AiResearchChat.findOne({ owner: req.user._id })) || new AiResearchChat({ owner: req.user._id });
    const answer = await geminiService.chat(question, thread.turns);

    thread.turns = [...thread.turns, { role: 'user', text: question, at: new Date() }, { role: 'assistant', text: answer.reply, model: answer.model, at: new Date() }]
      .slice(-CHAT_TURNS_KEPT);
    await thread.save();

    return successResponse(res, 200, 'Research desk answered', {
      reply: answer.reply,
      model: answer.model,
      generatedAt: answer.generatedAt,
      turns: thread.turns
    });
  } catch (error) {
    if (error.code === 'AI_NOT_CONFIGURED') return errorResponse(res, 503, error.message);
    if (String(error.code || '').startsWith('AI_')) return errorResponse(res, 502, error.message);
    next(error);
  }
});

// Clears the thread. It stays a document with no turns rather than being
// deleted, because "start again" and "this never existed" are different things
// to know when the same admin comes back tomorrow.
router.delete('/ai/chat', authorize('ADMIN'), async (req, res, next) => {
  try {
    await AiResearchChat.findOneAndUpdate({ owner: req.user._id }, { $set: { turns: [] } }, { upsert: true, new: true });
    return successResponse(res, 200, 'Research thread cleared', { turns: [] });
  } catch (error) {
    next(error);
  }
});

/**
 * Photographs for a story, only if they really load.
 *
 * Two sources, deliberately: Commons' own search, which can only return files
 * that exist there, and the links Gemini names - every one of those is then
 * fetched here, sized from the bytes of the picture itself, and thrown away if
 * it does not answer. What reaches the admin is a strip of pictures that exist,
 * each with its real dimensions and the largest version its source is willing
 * to serve - up to 4K on the long side, never claimed beyond what the file
 * actually holds. Either source failing is a reported gap rather than an empty
 * panel; the newsroom still gets pictures from the other.
 */
router.post('/ai/photos', authorize('ADMIN'), async (req, res, next) => {
  try {
    const topic = plainText(req.body?.topic, { maxLength: 400 });
    if (topic.trim().length < 6) return errorResponse(res, 400, 'Say what the picture should show');
    const region = req.body?.region ? plainText(req.body.region, { maxLength: 160 }) : '';

    const [library, named] = await Promise.all([
      aiPhotoService.search(topic, { limit: 8 }).catch((error) => ({ photos: [], note: `Commons could not be searched: ${String(error.message || error).slice(0, 120)}` })),
      geminiService.photoLinks({ topic, region })
        .then((answer) => ({ answer, model: answer.model }))
        .catch((error) => {
          if (error.code === 'AI_NOT_CONFIGURED' || String(error.code || '').startsWith('AI_')) {
            return { answer: { photos: [] }, model: '', note: error.message };
          }
          throw error;
        })
    ]);

    const { photos: fetched, dropped } = await aiPhotoService.verify(named.answer.photos, { limit: 8 });
    // The model's own picks come first - it was told what the story is about, so
    // its reason for each picture is worth more than a title match - and the
    // repository's results fill the rest of the strip.
    const seen = new Set();
    const photos = [...fetched, ...library.photos].filter((photo) => {
      const key = String(photo.originalUrl || photo.url).split('/').pop() || photo.url;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 12);

    const note = [library.note, named.note].filter(Boolean).join(' ');
    return successResponse(res, 200, photos.length ? `${photos.length} picture${photos.length === 1 ? '' : 's'} you can use` : 'No picture could be fetched for that topic', {
      photos,
      dropped,
      asked: named.answer.photos.length,
      model: named.model,
      note
    });
  } catch (error) {
    if (error.code === 'AI_NOT_CONFIGURED') return errorResponse(res, 503, error.message);
    if (String(error.code || '').startsWith('AI_')) return errorResponse(res, 502, error.message);
    next(error);
  }
});

router.post('/ai/articles', authorize('ADMIN'), async (req, res, next) => {
  try {
    const {
      title,
      summary,
      content,
      category,
      metaDescription,
      tags = [],
      featuredImage,
      imageCredit,
      imageCaption,
      imageSourceUrl,
      videoUrl,
      publish
    } = req.body || {};
    if (!title || !summary || !content || !category) {
      return errorResponse(res, 400, 'Title, summary, content and category are required');
    }
    const video = storyVideo.resolve(videoUrl);
    if (!video.ok) return errorResponse(res, 400, video.reason);
    const categoryDoc = await Category.findById(category);
    if (!categoryDoc) return errorResponse(res, 404, 'Category not found');

    const wantsPublish = publish === undefined ? await isAutoPublishOn() : publish === true || publish === 'true';
    const publishedAt = wantsPublish ? new Date() : undefined;    // The text comes back from the browser, so it is cleaned the same way a
    // writer's story is - a machine can hand over a headline carrying markup.
    const headline = plainText(title, { maxLength: 200 });
    const body = cleanText(content, { maxLength: 60000 });
    const gist = cleanText(summary, { maxLength: 600 });
    if (!headline || !body || !gist) {
      return errorResponse(res, 400, 'Title, summary and content have to say something');
    }
    // A title in one of the languages we cannot slug leaves an empty address,
    // which would break the story route.
    const baseSlug = generateSlug(headline) || 'inkuru';
    const article = await Article.create({
      title: headline,
      slug: `${baseSlug}-${Date.now()}`,
      summary: gist,
      metaDescription: metaDescription ? plainText(metaDescription, { maxLength: 200 }) : undefined,
      content: body,
      featuredImage: safeMediaUrl(featuredImage),
      imageCredit: imageCredit ? plainText(imageCredit, { maxLength: 160 }) : '',
      imageCaption: imageCaption ? plainText(imageCaption, { maxLength: 240 }) : '',
      imageSourceUrl: safeMediaUrl(imageSourceUrl),
      ...video.fields,
      author: req.user._id,
      category: categoryDoc._id,
      tags: cleanTags(tags, { max: 6 }),
      language: 'en',
      aiGenerated: true,
      status: wantsPublish ? 'published' : 'draft',
      publishedAt,
      // A machine wrote it and a named person let it out. Both facts belong in
      // the same trail an editor's decision leaves, or the queue cannot say who
      // released the story.
      reviewEvents: [{
        from: 'draft',
        to: wantsPublish ? 'published' : 'draft',
        by: req.user._id,
        note: wantsPublish ? 'Published from the AI newsroom' : 'Saved from the AI newsroom',
        at: new Date(),
      }],
      approvedBy: wantsPublish ? req.user._id : undefined,
      reviewedAt: new Date(),
    });

    if (wantsPublish) await notificationService.announceArticlePublished(article);

    return successResponse(res, 201, wantsPublish ? 'Story published' : 'Story saved as a draft', { article });
  } catch (error) {
    next(error);
  }
});

router.get('/ai/articles', authorize('ADMIN'), async (req, res, next) => {
  try {
    const articles = await Article.find({ aiGenerated: true })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('category', 'name slug');
    // The queue is anything a machine wrote that no reader has seen yet.
    const pendingReview = await Article.countDocuments({ aiGenerated: true, status: { $in: ['draft', 'pending_review'] } });
    return successResponse(res, 200, 'AI stories', { articles, pendingReview });
  } catch (error) {
    next(error);
  }
});

/**
 * What Google says people are searching for right now, in the regions the
 * newsroom watches. Server-side only, and every topic carries the feed it came
 * from so an admin can check it before a story is built on it.
 */
router.get('/trends', authorize('ADMIN'), async (req, res, next) => {
  try {
    const force = req.query.refresh === '1' || req.query.refresh === 'true';
    return successResponse(res, 200, 'Trending searches', await trendService.radar({ force }));
  } catch (error) {
    next(error);
  }
});

// The contact form on /contact lands here. Editors see it too: a correction
// belongs to whoever reads it first, not only to the owner.
router.get('/contact-messages', async (req, res, next) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const filter = status && ['open', 'answered', 'closed'].includes(status) ? { status } : {};
    const messages = await ContactMessage.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .populate('handledBy', 'fullName username');
    const total = await ContactMessage.countDocuments(filter);
    const openCount = await ContactMessage.countDocuments({ status: 'open' });
    return successResponse(res, 200, 'Messages fetched', { messages, total, openCount, page: Number(page), limit: Number(limit) });
  } catch (error) {
    next(error);
  }
});

router.put('/contact-messages/:id/status', async (req, res, next) => {
  try {
    const status = plainText(req.body.status, { maxLength: 20 });
    if (!['open', 'answered', 'closed'].includes(status)) return errorResponse(res, 400, 'That is not a state a message can be in.');
    const message = await ContactMessage.findById(req.params.id);
    if (!message) return errorResponse(res, 404, 'Message not found');
    message.status = status;
    // Who dealt with it is only worth recording once it leaves the inbox; putting
    // it back to open should not leave a name against an unanswered question.
    message.handledBy = status === 'open' ? null : req.user._id;
    message.handledAt = status === 'open' ? null : new Date();
    await message.save();
    return successResponse(res, 200, 'Message updated', { message });
  } catch (error) {
    next(error);
  }
});

// A reader can ask for what they wrote to us to be removed, and the request form
// itself holds a personal address, so deletion has to exist rather than be a
// promise on the privacy page.
router.delete('/contact-messages/:id', authorize('ADMIN'), async (req, res, next) => {
  try {
    const message = await ContactMessage.findByIdAndDelete(req.params.id);
    if (!message) return errorResponse(res, 404, 'Message not found');
    return successResponse(res, 200, 'Message deleted');
  } catch (error) {
    next(error);
  }
});

/**
 * The radio timetable.
 *
 * What a programme is called, when it starts, which sections it draws on and
 * whether the model writes its intro - the shape of the station, in other words.
 * It is admin-only rather than editor-level because it decides what the site says
 * out loud to every reader, on a schedule, with nobody pressing publish.
 *
 * Saving a timetable does not delete the editions already broadcast: they stay as
 * a record of what was said under the old one.
 */
router.get('/radio/schedule', authorize('ADMIN'), async (req, res, next) => {
  try {
    const schedule = await radioService.getSchedule();
    return successResponse(res, 200, 'Radio timetable', {
      timezone: schedule.timezone,
      updatedAt: schedule.updatedAt,
      slots: schedule.toObject().slots,
      // So the desk can show what is actually on air under this timetable without
      // the admin guessing whether their times were read the way they meant. The
      // edition is included because "who wrote the line the reader is hearing" is
      // the question this panel exists to answer.
      now: await radioService.timetable({ now: new Date() })
    });
  } catch (error) {
    next(error);
  }
});

router.put('/radio/schedule', authorize('ADMIN'), async (req, res, next) => {
  try {
    const result = await radioService.saveSchedule({
      slots: req.body.slots,
      timezone: req.body.timezone,
      updatedBy: req.user._id
    });
    if (result.error) return errorResponse(res, 400, result.error);
    const schedule = result.schedule;
    return successResponse(res, 200, 'Radio timetable saved', {
      timezone: schedule.timezone,
      updatedAt: schedule.updatedAt,
      slots: schedule.toObject().slots
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Make this edition again from what is published now.
 *
 * An edition is deliberately frozen, which is right for a reader and wrong after
 * the newsroom pulls a story or rewrites a headline: the six o'clock programme
 * would keep naming it. So the refresh exists as a button an admin presses rather
 * than as something that happens whenever a page is opened.
 */
router.post('/radio/bulletin/refresh', authorize('ADMIN'), async (req, res, next) => {
  try {
    const { resolved } = await radioService.resolveNow(new Date());
    if (!resolved.current) return errorResponse(res, 400, 'Nothing is scheduled to be on air at this minute');
    const slotId = String(resolved.current.slot._id);
    await radioService.dropBulletin({ slotId, occurrence: resolved.current.occurrenceKey });
    const bulletin = await radioService.bulletinFor(resolved.current, { now: new Date(), awaitScript: true });
    if (!bulletin) return errorResponse(res, 500, 'The edition could not be made');
    return successResponse(res, 200, 'Edition rebuilt', {
      bulletin: {
        slotName: bulletin.slotName,
        occurrence: bulletin.occurrence,
        scriptSource: bulletin.scriptSource,
        model: bulletin.model,
        note: bulletin.note,
        opening: bulletin.opening,
        closing: bulletin.closing,
        stories: bulletin.storyTitles
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * The section desk.
 *
 * A section is where a story lives, so the list carries the story count and
 * whether the address is a published one before an admin is allowed to touch it.
 * Reading it is staff work; changing it belongs to the owner alone - an editor
 * decides what goes in a section, not what sections exist.
 */
function refuse(res, next, error) {
  // The service knows the difference between a typo (400), a section that is
  // gone (404) and one that still holds stories (409), and the admin has to read
  // that difference rather than "Internal server error". Any other failure is
  // left for the global handler, which is the one that knows how to log it.
  const status = Number(error?.status);
  if (status >= 400 && status < 500 && error?.message) return errorResponse(res, status, error.message);
  return next(error);
}

router.get('/categories', async (req, res, next) => {
  try {
    return successResponse(res, 200, 'Sections', { categories: await categoryService.list() });
  } catch (error) {
    refuse(res, next, error);
  }
});

router.post('/categories', authorize('ADMIN'), async (req, res, next) => {
  try {
    const category = await categoryService.create(req.body || {}, req.user._id);
    return successResponse(res, 201, 'Section created', { category });
  } catch (error) {
    refuse(res, next, error);
  }
});

router.put('/categories/:id', authorize('ADMIN'), async (req, res, next) => {
  try {
    const category = await categoryService.update(req.params.id, req.body || {}, req.user._id);
    return successResponse(res, 200, 'Section saved', { category });
  } catch (error) {
    refuse(res, next, error);
  }
});

/**
 * Remove a section - or move its stories somewhere else and then remove it.
 *
 * A section with stories in it is refused with the count and the two ways out
 * (hide it, or name the section they move to). Nothing here silently orphans a
 * published story, which is the one thing a taxonomy tool has to be trusted not
 * to do.
 */
router.delete('/categories/:id', authorize('ADMIN'), async (req, res, next) => {
  try {
    const result = await categoryService.remove(req.params.id, { moveTo: req.query.moveTo });
    return successResponse(res, 200, result.moved ? 'Section removed and stories moved' : 'Section removed', result);
  } catch (error) {
    refuse(res, next, error);
  }
});

/**
 * The advertising desk.
 *
 * These are the spaces the newsroom sells itself - the ones Google's auction has
 * not bought. An ad here is a claim a named business is making to a reader, so
 * the same rule as the AI writer applies with nothing added: the machine drafts
 * from a brief a person typed, a person reads it, and only a person publishes it.
 * A generated creative comes back from /ads/generate unsaved; nothing this server
 * does can put words on the page without a status change someone pressed.
 */
function refuseAi(res, next, error) {
  if (error.code === 'AI_NOT_CONFIGURED') return errorResponse(res, 503, 'Gemini is not configured on this server, so the creative has to be written by hand.');
  if (String(error.code || '').startsWith('AI_')) return errorResponse(res, 502, error.message);
  return refuse(res, next, error);
}

router.get('/ads', async (req, res, next) => {
  try {
    return successResponse(res, 200, 'Advertisements', { ads: await adService.list() });
  } catch (error) {
    refuse(res, next, error);
  }
});

/**
 * Draft a creative from the brief an admin typed.
 *
 * Nothing is written to the database here: the answer goes back to the form, and
 * the campaign only exists once someone saves it. That is deliberate - a model
 * asked for three versions of an ad should not leave three records behind.
 */
router.post('/ads/generate', authorize('ADMIN'), async (req, res, next) => {
  const body = req.body || {};
  const advertiser = plainText(body.advertiser, { maxLength: 80 });
  const offer = cleanText(body.offer, { maxLength: 1200 });
  const placement = adService.PLACEMENTS.includes(body.placement) ? body.placement : adService.PLACEMENTS[0];
  const tone = plainText(body.tone, { maxLength: 160 });
  const mustInclude = plainText(body.mustInclude, { maxLength: 300 });
  const link = String(body.link || '').trim();

  if (!advertiser) return errorResponse(res, 400, 'Say who the advertisement is from');
  if (offer.length < 12) return errorResponse(res, 400, 'Write the brief: what the advertiser is actually offering');
  if (link) {
    const checked = publicHttpsUrl(link);
    if (!checked.ok) return errorResponse(res, 400, `That link will not work in an ad: ${checked.reason}.`);
  }

  try {
    const creative = await geminiService.adCreative({ advertiser, offer, link, placement, tone, mustInclude });
    return successResponse(res, 200, 'Draft ready — read it before you publish', {
      ...creative,
      link,
      brief: offer,
      placements: [placement],
      status: 'draft',
      source: 'ai',
    });
  } catch (error) {
    refuseAi(res, next, error);
  }
});

router.post('/ads', authorize('ADMIN'), async (req, res, next) => {
  try {
    const ad = await adService.create(req.body || {}, req.user._id);
    return successResponse(res, 201, 'Advertisement saved', { ad });
  } catch (error) {
    refuse(res, next, error);
  }
});

router.put('/ads/:id', authorize('ADMIN'), async (req, res, next) => {
  try {
    const ad = await adService.update(req.params.id, req.body || {}, req.user._id);
    return successResponse(res, 200, ad.status === 'live' ? 'Advertisement published' : 'Advertisement saved', { ad });
  } catch (error) {
    refuse(res, next, error);
  }
});

/**
 * Take a campaign off the page for good.
 *
 * Pausing is offered first everywhere in the interface; this is the harder button,
 * and it refuses while the ad is still running.
 */
router.delete('/ads/:id', authorize('ADMIN'), async (req, res, next) => {
  try {
    return successResponse(res, 200, 'Advertisement removed', await adService.remove(req.params.id));
  } catch (error) {
    refuse(res, next, error);
  }
});

module.exports = router;
