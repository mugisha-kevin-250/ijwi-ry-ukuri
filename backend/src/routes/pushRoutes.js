const express = require('express');
const env = require('../config/env');
const PushSubscription = require('../models/PushSubscription');
const pushService = require('../utils/pushService');
const { protect, requirePermission, optionalAuth } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');
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
  return successResponse(res, 200, 'Push status', {
    enabled: pushService.configured,
    configured: pushService.configured,
    publicKeyAvailable: Boolean(env.VAPID_PUBLIC_KEY),
    privateKeyAvailable: Boolean(env.VAPID_PRIVATE_KEY),
    subject: env.VAPID_SUBJECT,
    reason: pushService.configured ? null : 'Set matching VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY values on the backend host, then redeploy.',
  });
});

router.post('/subscribe', optionalAuth, async (req, res, next) => {
  try {
    const subscription = readSubscription(req.body);
    if (!subscription) return errorResponse(res, 400, 'A complete push subscription is required');

    // An existing install re-posting its subscription must not lose the quiet
    // switch it already has, so the field is only written when it was sent.
    const settings = typeof req.body?.quiet === 'boolean' ? { quiet: req.body.quiet } : {};
    const owner = req.user?._id ? { user: req.user._id } : {};

    await PushSubscription.updateOne(
      { endpoint: subscription.endpoint },
      { $set: { ...subscription, ...settings, ...owner }, $setOnInsert: { quiet: true } },
      { upsert: true, setDefaultsOnInsert: false }
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

/**
 * Whether this device wants to be told quietly.
 *
 * The address a browser hands us to deliver a notification is itself the
 * capability: the same value already unlocks /unsubscribe with no account
 * behind it. So this is keyed the same way, and it only ever reports or changes
 * one boolean about one device.
 */
router.post('/quiet', async (req, res, next) => {
  try {
    const endpoint = String(req.body?.endpoint || '').trim();
    const quiet = req.body?.quiet === true;
    if (!endpoint) return errorResponse(res, 400, 'endpoint is required');

    const result = await PushSubscription.updateOne({ endpoint }, { $set: { quiet } });
    if (!result.matchedCount) return errorResponse(res, 404, 'That device is not subscribed to alerts');
    return successResponse(res, 200, quiet ? 'Alerts will arrive without a sound' : 'Alerts will make a sound', { quiet });
  } catch (error) {
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

router.get('/subscriptions', protect, requirePermission([PERMISSIONS.sendPushAlerts]), async (req, res, next) => {
  try {
    const count = await PushSubscription.countDocuments();
    return successResponse(res, 200, 'Push subscribers', { count, enabled: pushService.configured });
  } catch (error) {
    next(error);
  }
});

router.post('/broadcast', protect, requirePermission([PERMISSIONS.sendPushAlerts]), async (req, res, next) => {
  try {
    const title = String(req.body?.title || '').trim();
    const body = String(req.body?.body || '').trim();
    if (!title || !body) return errorResponse(res, 400, 'title and body are required');
    if (title.length > 120 || body.length > 400) return errorResponse(res, 400, 'Message is too long for a notification');

    const url = String(req.body?.url || '/').trim();
    if (!pushService.configured) return errorResponse(res, 503, 'Push is not configured on this server');

    // Two switches the sender can see the use for. Quiet is for a bulletin that
    // should be there when the reader looks but should not interrupt a meeting;
    // urgent keeps the notification on the screen until it is dealt with, which
    // is only honest for something the newsroom would put a warning label on.
    const silent = req.body?.silent === true;
    const urgent = req.body?.urgent === true;

    const result = await pushService.sendToAll({
      title,
      body,
      url,
      tag: urgent ? `manual-alert-${Date.now()}` : 'manual-broadcast',
      ...(silent ? { silent: true } : {}),
      ...(urgent ? { requireInteraction: true } : {})
    });
    return successResponse(res, 200, 'Broadcast finished', result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
