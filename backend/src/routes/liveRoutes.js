const express = require('express');
const Live = require('../models/Live');
const LiveComment = require('../models/LiveComment');
const { protect, authorize } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { notifyLiveEnded } = require('../sockets/liveSocket');

const router = express.Router();

const HOST_FIELDS = 'fullName username avatar';

async function shape(live) {
  if (!live) return null;
  const populated = await live.populate('host', HOST_FIELDS).then((doc) => doc.toJSON());
  populated.sharePath = `/live/${populated._id}`;
  return populated;
}

router.get('/current', async (req, res, next) => {
  try {
    const live = await Live.findOne({ status: 'active' }).sort({ startedAt: -1 });
    return successResponse(res, 200, 'Current live', { live: live ? await shape(live) : null });
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 30);
    const found = await Live.find().sort({ status: 1, startedAt: -1 }).limit(limit);
    const lives = await Promise.all(found.map(shape));
    return successResponse(res, 200, 'Lives', { lives });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/comments', async (req, res, next) => {
  try {
    const comments = await LiveComment.find({ live: req.params.id }).sort({ createdAt: 1 }).limit(100).lean();
    return successResponse(res, 200, 'Live comments', { comments });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const live = await Live.findById(req.params.id);
    if (!live) return errorResponse(res, 404, 'No such broadcast');
    return successResponse(res, 200, 'Live', { live: await shape(live) });
  } catch (error) {
    next(error);
  }
});

// Only the admin can put a camera on air, and only one broadcast can be live.
router.post('/', protect, authorize('ADMIN'), async (req, res, next) => {
  try {
    const title = String(req.body.title || '').trim();
    if (!title) return errorResponse(res, 400, 'A live needs a title');

    const running = await Live.findOne({ status: 'active' });
    if (running) {
      running.status = 'ended';
      running.endedAt = new Date();
      running.viewers = 0;
      await running.save();
      notifyLiveEnded(running._id);
    }

    const live = await Live.create({
      title: title.slice(0, 140),
      description: String(req.body.description || '').slice(0, 500),
      host: req.user._id
    });
    return successResponse(res, 201, 'Live started', { live: await shape(live) });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/end', protect, authorize('ADMIN'), async (req, res, next) => {
  try {
    const live = await Live.findOne({ _id: req.params.id, status: 'active' });
    if (!live) return errorResponse(res, 404, 'Nothing is live right now');
    live.status = 'ended';
    live.endedAt = new Date();
    live.viewers = 0;
    await live.save();
    notifyLiveEnded(live._id);
    return successResponse(res, 200, 'Live ended', { live: await shape(live) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
