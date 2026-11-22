const express = require('express');
const Live = require('../models/Live');
const LiveComment = require('../models/LiveComment');
const { protect, requirePermission } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { notifyLiveEnded } = require('../sockets/liveSocket');
const { plainText, cleanText } = require('../utils/textFields');
const storyVideo = require('../services/storyVideo');

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

// Only the admin can put a camera or a video on air, and only one broadcast can
// be live.
//
// The link is read before anything is touched. A wrong address must not be able
// to end the programme that is actually running.
router.post('/', protect, requirePermission([PERMISSIONS.manageBroadcast]), async (req, res, next) => {
  try {
    const title = String(req.body.title || '').trim();
    if (!title) return errorResponse(res, 400, 'A live needs a title');

    const pasted = String(req.body.videoUrl || '').trim();
    let video = null;
    if (pasted) {
      // Read exactly the way a story reads the clip an author attaches, so a
      // link that works in a story works on air too - and a clip uploaded to
      // this API, which is only a path on this server, can be put on air as
      // well. What is stored is never the pasted text: it is the address the
      // player is allowed to load, rebuilt here from the video id.
      const resolved = storyVideo.resolve(pasted);
      if (!resolved.ok) return errorResponse(res, 400, `That video cannot go on air — ${resolved.reason}`);
      if (resolved.fields.videoSource === 'link') {
        return errorResponse(res, 400, 'That video cannot go on air — on TV the site plays YouTube, Vimeo, Facebook, Instagram and TikTok links, a video file address, or a clip uploaded here.');
      }
      video = {
        source: resolved.fields.videoSource,
        embedUrl: resolved.fields.videoEmbedUrl,
        watchUrl: resolved.fields.videoUrl
      };
    }

    const running = await Live.findOne({ status: 'active' });
    if (running) {
      running.status = 'ended';
      running.endedAt = new Date();
      running.viewers = 0;
      await running.save();
      notifyLiveEnded(running._id);
    }

    const live = await Live.create({
      title: plainText(title, { maxLength: 140 }),
      description: cleanText(req.body.description, { maxLength: 500 }),
      host: req.user._id,
      // With no link the broadcast is the one this model was built for: the
      // admin's camera, carried peer-to-peer to every reader.
      source: video ? video.source : 'camera',
      videoUrl: video ? pasted.slice(0, 500) : '',
      watchUrl: video ? video.watchUrl : '',
      embedUrl: video ? video.embedUrl : ''
    });
    return successResponse(res, 201, 'Live started', { live: await shape(live) });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/end', protect, requirePermission([PERMISSIONS.manageBroadcast]), async (req, res, next) => {
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
