const crypto = require('crypto');
const PlatformSetting = require('../models/PlatformSetting');
const ArticleView = require('../models/ArticleView');

async function hashIp(ip) {
  if (!ip) return null;
  return crypto.createHash('sha256').update(String(ip)).digest('hex');
}

async function getSettings() {
  const settings = await PlatformSetting.find({});
  const map = {};
  for (const entry of settings) {
    map[entry.key] = entry.value;
  }
  return {
    duplicateViewInterval: Number(map.duplicateViewInterval || 300000),
    minimumReadingDuration: Number(map.minimumReadingDuration || 15),
    rewardRate: Number(map.rewardRate || 5000)
  };
}

async function calculateValidView({ articleId, userId, anonymousSessionId, ip, userAgent, readingDurationMs }) {
  const settings = await getSettings();
  const now = new Date();
  const hashedIp = await hashIp(ip);

  const duplicateWindow = settings.duplicateViewInterval;
  const minimumDuration = settings.minimumReadingDuration;
  const readingDurationSeconds = Math.max(0, Number(readingDurationMs || 0) / 1000);

  const similarQuery = {
    articleId,
    viewedAt: { $gte: new Date(now.getTime() - duplicateWindow) },
    $or: []
  };

  if (userId) {
    similarQuery.$or.push({ readerId: userId });
  }
  if (anonymousSessionId) {
    similarQuery.$or.push({ anonymousSessionId });
  }
  if (hashedIp) {
    similarQuery.$or.push({ hashedIp });
  }

  const priorView = await ArticleView.findOne(similarQuery).sort({ viewedAt: -1 });

  const isSuspicious = Boolean(
    !userAgent ||
    /bot|crawl|spider|headless|slurp|pingdom|semrush|bingpreview/i.test(String(userAgent)) ||
    readingDurationSeconds < minimumDuration / 60
  );

  const isValid = !priorView && !isSuspicious && readingDurationSeconds >= minimumDuration / 60;

  await ArticleView.create({
    articleId,
    readerId: userId || null,
    anonymousSessionId: anonymousSessionId || null,
    hashedIp,
    userAgent,
    viewedAt: now,
    readingDuration: readingDurationSeconds,
    isValid,
    isSuspicious: isSuspicious
  });

  return {
    isValid,
    isSuspicious,
    duplicateBlocked: Boolean(priorView),
    readingDurationSeconds
  };
}

module.exports = { calculateValidView, hashIp };
