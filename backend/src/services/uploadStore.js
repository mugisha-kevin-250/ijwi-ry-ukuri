const fs = require('fs');
const path = require('path');
const Upload = require('../models/Upload');
const env = require('../config/env');

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
    res.setHeader('Content-Type', doc.contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.end(doc.data);
  } catch (error) {
    next(error);
  }
}

module.exports = { save, serve, LIMIT_BYTES };
