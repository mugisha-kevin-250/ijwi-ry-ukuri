const { webpush, configured } = require('../config/push');
const PushSubscription = require('../models/PushSubscription');
const WriterProfile = require('../models/WriterProfile');
const Follow = require('../models/Follow');
const User = require('../models/User');

const SKIPPED = { sent: 0, expired: 0, failed: 0, total: 0, skipped: true };

// A push endpoint that answers 404/410 is dead for good (the user uninstalled
// the app or revoked the permission), so it is dropped instead of retried.
function isExpired(statusCode) {
  return statusCode === 404 || statusCode === 410;
}

async function sendBatch(subscriptions, payload) {
  if (!subscriptions.length) return { sent: 0, expired: 0, failed: 0, total: 0 };

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

async function sendToAll(payload) {
  if (!configured) return SKIPPED;
  return sendBatch(await PushSubscription.find().lean(), payload);
}

// Subscriptions carry the signing-in user, so followers can be addressed
// directly and every other install still gets the general alert.
async function followersOf(author) {
  const userId = author && author._id ? author._id : author;
  if (!userId) return new Set();
  const profile = await WriterProfile.findOne({ user: userId }).select('_id').lean();
  if (!profile) return new Set();
  const ids = await Follow.distinct('follower', { writer: profile._id });
  return new Set(ids.map(String));
}

async function notifyArticlePublished(article) {
  if (!configured) return SKIPPED;

  const url = `/article/${article.slug}`;
  const tag = `article-${article._id}`;
  const summary = article.summary || 'Inkuru nshya yasohotse / A new story is out.';

  const [subscriptions, followerIds] = await Promise.all([
    PushSubscription.find().lean(),
    followersOf(article.author),
  ]);

  const authorId = article.author && article.author._id ? article.author._id : article.author;
  const authorDoc = article.author && article.author.fullName
    ? article.author
    : authorId
      ? await User.findById(authorId).select('fullName').lean()
      : null;
  const authorName = (authorDoc && authorDoc.fullName) || '';

  const isFollower = (subscription) => Boolean(subscription.user) && followerIds.has(String(subscription.user));
  const followed = subscriptions.filter(isFollower);
  const others = subscriptions.filter((subscription) => !isFollower(subscription));

  const results = await Promise.all([
    sendBatch(followed, {
      title: article.title,
      body: authorName ? `${authorName}: ${summary}` : summary,
      url,
      tag
    }),
    sendBatch(others, { title: article.title, body: summary, url, tag })
  ]);

  return results.reduce(
    (total, part) => ({
      sent: total.sent + part.sent,
      expired: total.expired + part.expired,
      failed: total.failed + part.failed,
      total: total.total + part.total
    }),
    { sent: 0, expired: 0, failed: 0, total: 0 }
  );
}

// Publishing must never fail because a push hop is slow or unreachable.
function publishNotification(article) {
  return notifyArticlePublished(article).catch((error) => {
    console.warn('push broadcast skipped:', error.message);
    return { sent: 0, failed: 0, error: error.message };
  });
}

module.exports = { sendToAll, notifyArticlePublished: publishNotification, followersOf, configured };
