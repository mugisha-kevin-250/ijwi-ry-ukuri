const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Article = require('../models/Article');
const Follow = require('../models/Follow');
const Like = require('../models/Like');
const Comment = require('../models/Comment');
const Bookmark = require('../models/Bookmark');
const WriterProfile = require('../models/WriterProfile');
const { protect, optionalAuth } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { plainText, cleanText, safeMediaUrl } = require('../utils/textFields');

const router = express.Router();

// Follow.writer references a WriterProfile, not the User account.
async function countFollowers(userId) {
  const profile = await WriterProfile.findOne({ user: userId }).select('_id');
  if (!profile) return 0;
  return Follow.countDocuments({ writer: profile._id });
}

router.get('/me', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    return successResponse(res, 200, 'Current user', { user });
  } catch (error) {
    next(error);
  }
});

router.put('/me', protect, async (req, res, next) => {
  try {
    const { fullName, bio, avatar, country, language } = req.body;
    const user = await User.findById(req.user._id);
    if (fullName) {
      const name = plainText(fullName, { maxLength: 80 });
      if (!name) return errorResponse(res, 400, 'Name has to say something');
      user.fullName = name;
    }
    if (bio !== undefined) user.bio = cleanText(bio, { maxLength: 500 });
    if (avatar !== undefined) user.avatar = safeMediaUrl(avatar);
    if (country !== undefined) user.country = plainText(country, { maxLength: 60 });
    if (language !== undefined) user.language = plainText(language, { maxLength: 8 }) || user.language;
    user.updatedAt = new Date();
    await user.save();
    return successResponse(res, 200, 'Profile updated', { user });
  } catch (error) {
    next(error);
  }
});

// The reader's own shelf. Stories that were deleted or taken down are left out
// of the list but counted, so the page can say so instead of quietly losing
// them, and only the fields a shelf row shows travel back to the browser.
router.get('/me/bookmarks', protect, async (req, res, next) => {
  try {
    const rows = await Bookmark.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate({
        path: 'article',
        select: 'title slug summary featuredImage readingTime publishedAt status author',
        populate: { path: 'author', select: 'fullName username' },
      });
    const bookmarks = rows.filter((row) => row.article && row.article.status === 'published');
    return successResponse(res, 200, 'Bookmarks', {
      bookmarks: bookmarks.map((row) => ({ _id: row._id, savedAt: row.createdAt, article: row.article })),
      unavailable: rows.length - bookmarks.length,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/me/following', protect, async (req, res, next) => {
  try {
    const rows = await Follow.find({ follower: req.user._id })
      .sort({ createdAt: -1 })
      .populate({ path: 'writer', populate: { path: 'user', select: 'fullName username avatar bio' } });
    const follows = rows.filter((row) => row.writer && row.writer.user);
    return successResponse(res, 200, 'Following list', {
      follows,
      unavailable: rows.length - follows.length,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/me/stats', protect, async (req, res, next) => {
  try {
    const [articles, followers, following, likesAgg] = await Promise.all([
      Article.find({ author: req.user._id }),
      countFollowers(req.user._id),
      Follow.countDocuments({ follower: req.user._id }),
      Article.aggregate([{ $match: { author: req.user._id } }, { $group: { _id: null, totalLikes: { $sum: '$likes' }, totalViews: { $sum: '$views' } } }])
    ]);
    const published = articles.filter((a) => a.status === 'published').length;
    return successResponse(res, 200, 'User stats', {
      totalArticles: articles.length,
      publishedArticles: published,
      followers,
      following,
      totalLikes: likesAgg[0]?.totalLikes || 0,
      totalViews: likesAgg[0]?.totalViews || 0
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/profile', optionalAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return errorResponse(res, 404, 'User not found');
    const [articles, followers, following, likesAgg] = await Promise.all([
      Article.find({ author: user._id, status: 'published' }).sort({ publishedAt: -1 }),
      countFollowers(user._id),
      Follow.countDocuments({ follower: user._id }),
      Article.aggregate([{ $match: { author: user._id } }, { $group: { _id: null, totalLikes: { $sum: '$likes' }, totalViews: { $sum: '$views' } } }])
    ]);
    return successResponse(res, 200, 'User profile', {
      user,
      articles,
      stats: {
        totalArticles: articles.length,
        followers,
        following,
        totalLikes: likesAgg[0]?.totalLikes || 0,
        totalViews: likesAgg[0]?.totalViews || 0
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
