const fs = require('fs');
const path = require('path');
const Upload = require('../models/Upload');
const env = require('../config/env');
const storageManager = require('./storageManager');

const LIMIT_BYTES = env.UPLOAD_STORE_LIMIT_MB * 1024 * 1024;

async function storedBytes() {
  const [totals] = await Upload.aggregate([{ $group: { _id: null, size: { $sum: '$size' } } }]);
  return totals ? totals.size : 0;
}

/**
 * Stores the bytes in MongoDB so a redeploy cannot delete them, and mirrors the
 * file onto the local disk as a cache express.static can serve without a query.
 */
async function save({ buffer, filename, mimetype, user }) {
  const usage = await storageManager.getUsage();
  if (env.NODE_ENV === 'production' && (usage.usedPercent >= 60 || usage.uploadStorage.usedPercent >= 60)) {
    const error = new Error('Uploads are paused because MongoDB storage has reached the 60% safety limit. RADAR storage cleanup must complete first.');
    error.statusCode = 507;
    throw error;
  }
  const stored = await storedBytes();
  if (stored + buffer.length > LIMIT_BYTES) {
    const error = new Error('The image store is full. Free space in Settings before uploading again.');
    error.statusCode = 507;
    throw error;
  }

  await Upload.create({
    filename,
    contentType: mimetype,
    size: buffer.length,
    data: buffer,
    uploadedBy: user ?? null
  });

  // The disk is only a cache and Atlas already holds the durable copy, so the
  // mirror is left running in the background: a slow or read-only filesystem
  // must not add its latency to the upload the writer is waiting for.
  fs.promises
    .writeFile(path.join(env.UPLOAD_DIR, filename), buffer)
    .catch(() => {});

  return `/uploads/${filename}`;
}

/** Fallback for /uploads/* when the ephemeral disk no longer has the file. */
async function serve(req, res, next) {
  try {
    const filename = path.basename(String(req.params.filename || ''));
    // No lean(): a plain query hands back a BSON Binary, which res.end rejects.
    const doc = await Upload.findOne({ filename }).select('+data');
    if (!doc) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }
    const bytes = doc.data;
    const total = bytes.length;
    res.setHeader('Content-Type', doc.contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Accept-Ranges', 'bytes');

    // A video is read in pieces: the browser asks for the end of the file to find
    // where the duration is, then for the start, and Safari and iOS refuse to play
    // anything that answers them with one whole 200 response. The bytes already
    // arrived in one document, so serving a slice of them costs nothing.
    const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || '').trim());
    if (range && (range[1] || range[2])) {
      // "bytes=-500" is the last 500 bytes, not the first: an empty start is a
      // suffix, an empty end means the rest of the file.
      const start = range[1] ? Number(range[1]) : Math.max(0, total - Number(range[2]));
      const end = range[1] && range[2] ? Number(range[2]) : total - 1;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start >= total || start > end) {
        res.setHeader('Content-Range', `bytes */${total}`);
        return res.status(416).end();
      }
      const last = Math.min(end, total - 1);
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${last}/${total}`);
      res.setHeader('Content-Length', last - start + 1);
      return res.end(bytes.subarray(start, last + 1));
    }

    res.setHeader('Content-Length', total);
    return res.end(bytes);
  } catch (error) {
    next(error);
  }
}

module.exports = { save, serve, LIMIT_BYTES };
