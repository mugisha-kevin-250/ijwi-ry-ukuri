const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Article = require('../models/Article');
const Follow = require('../models/Follow');
const Like = require('../models/Like');
const Comment = require('../models/Comment');
const Bookmark = require('../models/Bookmark');
const { protect, optionalAuth } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/apiResponse');

const router = express.Router();

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
    if (fullName) user.fullName = fullName;
    if (bio !== undefined) user.bio = bio;
    if (avatar !== undefined) user.avatar = avatar;
    if (country !== undefined) user.country = country;
    if (language !== undefined) user.language = language;
    user.updatedAt = new Date();
    await user.save();
    return successResponse(res, 200, 'Profile updated', { user });
  } catch (error) {
    next(error);
  }
});

router.get('/me/bookmarks', protect, async (req, res, next) => {
  try {
    const bookmarks = await Bookmark.find({ user: req.user._id }).populate('article');
    return successResponse(res, 200, 'Bookmarks', { bookmarks });
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

router.get('/me/stats', protect, async (req, res, next) => {
  try {
    const [articles, followers, following, likesAgg] = await Promise.all([
      Article.find({ author: req.user._id }),
      Follow.countDocuments({ writer: req.user._id }),
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
      Follow.countDocuments({ writer: user._id }),
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
