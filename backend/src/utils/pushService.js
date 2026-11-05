const { webpush, configured } = require('../config/push');
const PushSubscription = require('../models/PushSubscription');

// A push endpoint that answers 404/410 is dead for good (the user uninstalled
// the app or revoked the permission), so it is dropped instead of retried.
function isExpired(statusCode) {
  return statusCode === 404 || statusCode === 410;
}

async function sendToAll(payload) {
  if (!configured) return { sent: 0, expired: 0, failed: 0, total: 0, skipped: true };

  const subscriptions = await PushSubscription.find().lean();
  const results = await Promise.allSettled(subscriptions.map((subscription) => webpush.sendNotification(
    { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
    JSON.stringify(payload),
    { TTL: 60 * 60 * 12 }
  )));

  let sent = 0;
  let expired = 0;
  let failed = 0;
  const expiredEndpoints = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      sent += 1;
      return;
    }
    const error = result.reason;
    if (isExpired(error && error.statusCode)) {
      expired += 1;
      expiredEndpoints.push(subscriptions[index].endpoint);
    } else {
      failed += 1;
    }
  });

  if (expiredEndpoints.length) {
    await PushSubscription.deleteMany({ endpoint: { $in: expiredEndpoints } });
  }

  return { sent, expired, failed, total: subscriptions.length };
}

// Publishing must never fail because a push hop is slow or unreachable.
function notifyArticlePublished(article) {
  return sendToAll({
    title: article.title,
    body: article.summary || 'Inkuru nshya yasohotse / A new story is out.',
    url: `/article/${article.slug}`,
    tag: `article-${article._id}`
  }).catch((error) => {
    console.warn('push broadcast skipped:', error.message);
    return { sent: 0, failed: 0, error: error.message };
  });
}

module.exports = { sendToAll, notifyArticlePublished, configured };
