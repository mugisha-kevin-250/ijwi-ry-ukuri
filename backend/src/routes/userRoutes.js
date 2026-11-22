const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Article = require('../models/Article');
const Follow = require('../models/Follow');
const Like = require('../models/Like');
const Comment = require('../models/Comment');
const Bookmark = require('../models/Bookmark');
const WriterProfile = require('../models/WriterProfile');
const accountDeletion = require('../services/accountDeletion');
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

// The door the privacy page has promised since the first release. It is a
// DELETE on the reader's own address, and it asks for the password again
// because nothing else on this screen is undoable: an access token left on a
// borrowed laptop must not be enough to erase a person.
router.delete('/me', protect, async (req, res, next) => {
  try {
    const { password, confirm } = req.body || {};
    if (!password) {
      return errorResponse(res, 400, 'Type the account password first. This cannot be a mis-click.');
    }
    if (confirm !== true) {
      return errorResponse(res, 400, 'Say what you are agreeing to: the account and its personal data go for good.');
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user) return errorResponse(res, 404, 'That account is already gone.');
    if (!(await bcrypt.compare(String(password), user.password))) {
      return errorResponse(res, 401, 'That is not the password on this account.');
    }

    const outcome = await accountDeletion.closeAccount(user);
    if (!outcome.closed) {
      // The newsroom's own record is the reason, said in the newsroom's words.
      return errorResponse(res, 409, outcome.reasons.join(' '));
    }
    return successResponse(res, 200, 'Your account and the personal data we held on it are deleted.', {
      removed: outcome.removed,
      touchedStories: outcome.touchedStories,
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
