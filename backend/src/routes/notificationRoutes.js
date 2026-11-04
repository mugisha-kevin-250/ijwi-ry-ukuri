const express = require('express');
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/apiResponse');

const router = express.Router();

router.get('/', protect, async (req, res, next) => {
  try {
    const notifications = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 });
    return successResponse(res, 200, 'Notifications', { notifications });
  } catch (error) {
    next(error);
  }
});

router.put('/:id/read', protect, async (req, res, next) => {
  try {
    const notification = await Notification.findOne({ _id: req.params.id, user: req.user._id });
    if (!notification) return errorResponse(res, 404, 'Notification not found');
    notification.isRead = true;
    await notification.save();
    return successResponse(res, 200, 'Notification marked as read', { notification });
  } catch (error) {
    next(error);
  }
});

router.put('/read-all', protect, async (req, res, next) => {
  try {
    await Notification.updateMany({ user: req.user._id }, { isRead: true });
    return successResponse(res, 200, 'All notifications marked as read');
  } catch (error) {
    next(error);
  }
});

module.exports = router;
