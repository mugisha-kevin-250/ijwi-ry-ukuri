const crypto = require('crypto');
const PlatformSetting = require('../models/PlatformSetting');
const ArticleView = require('../models/ArticleView');

const BOT_UA_PATTERN = /bot|crawl|spider|headless|slurp|pingdom|semrush|bingpreview/i;

function hashIp(ip) {
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
    // duplicateViewInterval is milliseconds, minimumReadingDuration is seconds.
    duplicateViewInterval: Number(map.duplicateViewInterval || 300000),
    minimumReadingDuration: Number(map.minimumReadingDuration || 15),
    rewardRate: Number(map.rewardRate || 5000)
  };
}

// A reader is an account, else a browser session, else (only when neither is
// known) an IP + user agent pair. Matching on a bare IP would merge every reader
// behind one NAT into a single "duplicate" and freeze the counter.
function readerQuery({ userId, anonymousSessionId, hashedIp, userAgent }) {
  const or = [];
  if (userId) or.push({ readerId: userId });
  if (anonymousSessionId) or.push({ anonymousSessionId });
  if (!userId && !anonymousSessionId && hashedIp) {
    or.push({ hashedIp, userAgent: String(userAgent || '') });
  }
  return or;
}

async function calculateValidView({ articleId, userId, anonymousSessionId, ip, userAgent, readingDurationMs }) {
  const settings = await getSettings();
  const now = new Date();
  const hashedIp = hashIp(ip);
  const readingDurationSeconds = Math.max(0, Number(readingDurationMs || 0) / 1000);
  const isBot = !userAgent || BOT_UA_PATTERN.test(String(userAgent));

  const or = readerQuery({ userId, anonymousSessionId, hashedIp, userAgent });
  const priorView = or.length
    ? await ArticleView.findOne({ articleId, $or: or }).sort({ viewedAt: -1 })
    : null;

  // A read is opened by a zero-duration ping the moment the story is displayed,
  // then closed by the dwell report. The second call must never count twice, so
  // anything inside the duplicate window only gets to upgrade the open row.
  const withinDuplicateWindow = Boolean(
    priorView && priorView.viewedAt >= new Date(now.getTime() - settings.duplicateViewInterval)
  );

  if (withinDuplicateWindow) {
    const enoughToBeValid = readingDurationSeconds >= settings.minimumReadingDuration;
    if (priorView.isValid || !enoughToBeValid || isBot) {
      return {
        countView: false,
        isValid: false,
        uniqueView: false,
        isSuspicious: priorView.isSuspicious,
        duplicateBlocked: true,
        readingDurationSeconds
      };
    }
    priorView.readingDuration = Math.max(priorView.readingDuration || 0, readingDurationSeconds);
    priorView.isValid = true;
    priorView.isSuspicious = false;
    await priorView.save();
    return {
      countView: false,
      isValid: true,
      uniqueView: false,
      isSuspicious: false,
      duplicateBlocked: true,
      upgraded: true,
      readingDurationSeconds
    };
  }

  // `views` is every distinct read, `validViews` only the ones that look like a
  // real human read, `uniqueViews` only a reader's first ever read.
  const countView = !isBot;
  const isValid = countView && readingDurationSeconds >= settings.minimumReadingDuration;
  const uniqueView = countView && !priorView;
  const isSuspicious = isBot || !isValid;

  await ArticleView.create({
    articleId,
    readerId: userId || null,
    anonymousSessionId: anonymousSessionId || null,
    hashedIp,
    userAgent,
    viewedAt: now,
    readingDuration: readingDurationSeconds,
    isValid,
    isSuspicious
  });

  return {
    countView,
    isValid,
    uniqueView,
    isSuspicious,
    duplicateBlocked: false,
    readingDurationSeconds
  };
}

module.exports = { calculateValidView, hashIp };
