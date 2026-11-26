const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Article = require('../models/Article');
const Upload = require('../models/Upload');
const env = require('../config/env');
const auditLog = require('./auditLogService');

const LIMIT_MB = Math.max(64, Number(env.MONGODB_STORAGE_LIMIT_MB) || 512);
const TARGET_PERCENT = 55;
const CLEANUP_TRIGGER_PERCENT = 60;
const MIN_AGE_DAYS = 180;
const MAX_DELETE_PER_PASS = 100;

function imageFilenames(article) {
  const urls = [article.featuredImage, ...(article.media || []).filter(x => x.kind === 'image').map(x => x.url)];
  return [...new Set(urls.map(value => {
    const match = /^\/uploads\/([a-z0-9._-]{1,120}\.(?:jpe?g|png|webp|gif))$/i.exec(String(value || ''));
    return match ? match[1] : '';
  }).filter(Boolean))];
}

async function getUsage() {
  if (!mongoose.connection.db) throw new Error('MongoDB is not connected.');
  const [stats, uploadTotals] = await Promise.all([
    mongoose.connection.db.stats(1024 * 1024),
    Upload.aggregate([{ $group: { _id: null, bytes: { $sum: '$size' }, files: { $sum: 1 } } }])
  ]);
  const usedMB = Number(stats.dataSize || 0) + Number(stats.indexSize || 0);
  const uploadBytes = Number(uploadTotals[0]?.bytes || 0);
  const uploadLimitBytes = Number(env.UPLOAD_STORE_LIMIT_MB) * 1024 * 1024;
  const percent = LIMIT_BYTES > 0 ? usedMB / LIMIT_MB * 100 : 0;
  const uploadPercent = uploadLimitBytes > 0 ? uploadBytes / uploadLimitBytes * 100 : 0;
  return {
    capacityMB: LIMIT_MB,
    usedMB: Number(usedMB.toFixed(2)),
    remainingMB: Number(Math.max(0, LIMIT_MB - usedMB).toFixed(2)),
    usedPercent: Number(percent.toFixed(2)),
    uploadStorage: {
      capacityMB: Number(env.UPLOAD_STORE_LIMIT_MB),
      usedMB: Number((uploadBytes / 1048576).toFixed(2)),
      remainingMB: Number(Math.max(0, uploadLimitBytes - uploadBytes) / 1048576).toFixed(2),
      usedPercent: Number(uploadPercent.toFixed(2)),
      files: Number(uploadTotals[0]?.files || 0)
    },
    measuredAt: new Date().toISOString(),
    measurement: 'MongoDB logical dataSize + indexSize against MONGODB_STORAGE_LIMIT_MB; not Atlas physical disk allocation.'
  };
}

async function removeUnreferencedArticleImages(filenames, ownerId) {
  let deletedFiles = 0;
  let freedBytes = 0;
  for (const filename of filenames) {
    const url = '/uploads/' + filename;
    const stillUsed = await Article.exists({
      $or: [{ featuredImage: url }, { 'media.url': url }]
    });
    if (stillUsed) continue;
    const file = await Upload.findOne({ filename, uploadedBy: { $ne: ownerId } }).select('size').lean();
    if (!file) continue;
    const removed = await Upload.deleteOne({ _id: file._id, uploadedBy: { $ne: ownerId } });
    if (removed.deletedCount) {
      deletedFiles += 1;
      freedBytes += Number(file.size || 0);
      fs.promises.unlink(path.join(env.UPLOAD_DIR, filename)).catch(() => {});
    }
  }
  return { deletedFiles, freedMB: Number((freedBytes / 1048576).toFixed(2)) };
}

/**
 * Only low-engagement published stories at least six months old are eligible.
 * The Auto Manage owner and owner-uploaded files are never deleted. Drafts,
 * review queues, breaking stories, scheduled stories and stories with comments
 * or more than 25 views are excluded.
 */
async function runCleanup(ownerId) {
  const before = await getUsage();
  const result = {
    triggered: before.usedPercent > CLEANUP_TRIGGER_PERCENT,
    before,
    deletedStories: 0,
    deletedImages: 0,
    freedImageMB: 0,
    skipped: 'Storage is below the 60% cleanup trigger.',
    after: before
  };
  if (!result.triggered) return result;

  const cutoff = new Date(Date.now() - MIN_AGE_DAYS * 86400000);
  const candidates = await Article.find({
    status: 'published',
    publishedAt: { $lte: cutoff },
    author: { $ne: ownerId },
    views: { $lte: 25 },
    likes: { $lte: 0 },
    commentsCount: { $lte: 0 },
    isBreaking: { $ne: true },
    scheduledAt: null
  }).sort({ publishedAt: 1 }).limit(MAX_DELETE_PER_PASS)
    .select('_id title author featuredImage media').lean();

  for (const article of candidates) {
    const filenames = imageFilenames(article);
    const removed = await Article.deleteOne({
      _id: article._id,
      status: 'published',
      author: { $ne: ownerId },
      publishedAt: { $lte: cutoff },
      views: { $lte: 25 },
      likes: { $lte: 0 },
      commentsCount: { $lte: 0 },
      isBreaking: { $ne: true },
      scheduledAt: null
    });
    if (!removed.deletedCount) continue;

    result.deletedStories += 1;
    const media = await removeUnreferencedArticleImages(filenames, ownerId);
    result.deletedImages += media.deletedFiles;
    result.freedImageMB += media.freedMB;
    await auditLog.recordSafely({
      actor: ownerId,
      action: 'storage.old_story_deleted',
      entityType: 'article',
      entityId: article._id,
      entityLabel: article.title,
      summary: 'RADAR storage manager removed an old, low-engagement published story to protect MongoDB capacity.',
      details: { publishedBefore: cutoff.toISOString(), deletedImages: media.deletedFiles, freedImageMB: media.freedMB }
    });

    const current = await getUsage();
    if (current.usedPercent <= TARGET_PERCENT) break;
  }

  result.freedImageMB = Number(result.freedImageMB.toFixed(2));
  result.after = await getUsage();
  result.skipped = result.after.usedPercent <= TARGET_PERCENT
    ? 'Cleanup reached the 55% target.'
    : candidates.length
      ? 'Eligible stories were exhausted; storage remains above target. No owner data or protected stories were touched.'
      : 'No eligible old, low-engagement stories were found. No content was deleted.';
  await auditLog.recordSafely({
    actor: ownerId,
    action: 'storage.cleanup_completed',
    entityType: 'system',
    entityLabel: 'MongoDB storage',
    summary: 'RADAR storage cleanup pass completed.',
    details: {
      beforePercent: before.usedPercent,
      afterPercent: result.after.usedPercent,
      deletedStories: result.deletedStories,
      deletedImages: result.deletedImages,
      freedImageMB: result.freedImageMB
    }
  });
  return result;
}

module.exports = { getUsage, runCleanup, CLEANUP_TRIGGER_PERCENT, TARGET_PERCENT };
