const express = require('express');
const env = require('../config/env');
const PushSubscription = require('../models/PushSubscription');
const pushService = require('../utils/pushService');
const { protect, authorize, optionalAuth } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/apiResponse');

const router = express.Router();

function readSubscription(body) {
  const subscription = body?.subscription ?? body ?? {};
  const endpoint = String(subscription.endpoint || '').trim();
  const p256dh = String(subscription.keys?.p256dh || subscription.p256dh || '').trim();
  const auth = String(subscription.keys?.auth || subscription.auth || '').trim();
  if (!endpoint || !p256dh || !auth) return null;
  // Browser push endpoints are always https; http only exists for local testing.
  if (!/^https?:\/\//.test(endpoint)) return null;
  return { endpoint, p256dh, auth };
}

router.get('/public-key', (req, res) => {
  return successResponse(res, 200, 'VAPID public key', { publicKey: env.VAPID_PUBLIC_KEY || null });
});

router.get('/status', (req, res) => {
  return successResponse(res, 200, 'Push status', { enabled: pushService.configured });
});

router.post('/subscribe', optionalAuth, async (req, res, next) => {
  try {
    const subscription = readSubscription(req.body);
    if (!subscription) return errorResponse(res, 400, 'A complete push subscription is required');

    await PushSubscription.updateOne(
      { endpoint: subscription.endpoint },
      { $set: { ...subscription, user: req.user?._id ?? null } },
      { upsert: true }
    );

    const count = await PushSubscription.countDocuments();
    return successResponse(res, 201, 'Subscribed to push notifications', { count });
  } catch (error) {
    if (error && error.code === 11000) {
      const count = await PushSubscription.countDocuments();
      return successResponse(res, 200, 'Already subscribed', { count });
    }
    next(error);
  }
});

router.post('/unsubscribe', async (req, res, next) => {
  try {
    const endpoint = String(req.body?.endpoint || '').trim();
    if (!endpoint) return errorResponse(res, 400, 'endpoint is required');
    await PushSubscription.deleteMany({ endpoint });
    const count = await PushSubscription.countDocuments();
    return successResponse(res, 200, 'Unsubscribed from push notifications', { count });
  } catch (error) {
    next(error);
  }
});

router.get('/subscriptions', protect, authorize('ADMIN', 'EDITOR'), async (req, res, next) => {
  try {
    const count = await PushSubscription.countDocuments();
    return successResponse(res, 200, 'Push subscribers', { count, enabled: pushService.configured });
  } catch (error) {
    next(error);
  }
});

router.post('/broadcast', protect, authorize('ADMIN', 'EDITOR'), async (req, res, next) => {
  try {
    const title = String(req.body?.title || '').trim();
    const body = String(req.body?.body || '').trim();
    if (!title || !body) return errorResponse(res, 400, 'title and body are required');
    if (title.length > 120 || body.length > 400) return errorResponse(res, 400, 'Message is too long for a notification');

    const url = String(req.body?.url || '/').trim();
    if (!pushService.configured) return errorResponse(res, 503, 'Push is not configured on this server');

    const result = await pushService.sendToAll({ title, body, url, tag: 'manual-broadcast' });
    return successResponse(res, 200, 'Broadcast finished', result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
