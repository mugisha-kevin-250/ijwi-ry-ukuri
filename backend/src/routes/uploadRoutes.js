const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const uploadStore = require('../services/uploadStore');
const env = require('../config/env');

const router = express.Router();

const uploadDir = env.UPLOAD_DIR;
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// The declared type is only what the browser says it is, so the name has to
// agree. storyVideo accepts a stored file by exactly these extensions.
const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
const VIDEO_EXTENSION = /\.(mp4|webm|ogv|ogg|m4v|mov)$/i;

const uniqueName = (originalname) =>
  Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(originalname);

// The bytes go to MongoDB, so multer only ever holds them in memory.
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed.'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: MAX_FILE_SIZE }
});

// A clip is stored the same way a photograph is - the bytes go to MongoDB so a
// redeploy cannot delete them - but it is capped far below what a phone camera
// produces, because the whole file sits in one document and Mongo refuses a
// document over 16MB. Anything longer belongs on YouTube and is pasted as a
// link instead; that is what the story form says next to this button.
const MAX_VIDEO_SIZE = 12 * 1024 * 1024; // 12MB

const uploadVideo = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_VIDEO_MIME_TYPES.includes(file.mimetype) || !VIDEO_EXTENSION.test(file.originalname || '')) {
      return cb(new Error('Invalid file type. Only MP4, WebM, Ogg and QuickTime video files are allowed.'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: MAX_VIDEO_SIZE }
});

router.post('/image', protect, upload.single('image'), async (req, res) => {
  if (!req.file) return errorResponse(res, 400, 'No file uploaded');

  try {
    const url = await uploadStore.save({
      buffer: req.file.buffer,
      filename: uniqueName(req.file.originalname),
      mimetype: req.file.mimetype,
      user: req.user._id,
    });
    return successResponse(res, 200, 'Uploaded', { url });
  } catch (error) {
    if (error.statusCode) return errorResponse(res, error.statusCode, error.message);
    console.error('Upload failed:', error.message);
    return errorResponse(res, 502, 'Image storage is unavailable right now. Please try again.');
  }
});

// A clip attached to a story, for the author who has the file rather than a
// link. Anything longer than this belongs on YouTube, and the size message says
// so rather than leaving the writer guessing why the upload was refused.
router.post('/video', protect, uploadVideo.single('video'), async (req, res) => {
  if (!req.file) return errorResponse(res, 400, 'No file uploaded');

  try {
    const url = await uploadStore.save({
      buffer: req.file.buffer,
      filename: uniqueName(req.file.originalname),
      mimetype: req.file.mimetype,
      user: req.user._id,
    });
    return successResponse(res, 200, 'Uploaded', { url });
  } catch (error) {
    if (error.statusCode) return errorResponse(res, error.statusCode, error.message);
    console.error('Video upload failed:', error.message);
    return errorResponse(res, 502, 'Video storage is unavailable right now. Please try again.');
  }
});

// Handle multer errors
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE' && error.field === 'video') {
      return errorResponse(res, 400, 'That clip is too large. An upload takes up to 12MB — put a longer video on YouTube and paste its link instead.');
    }
    if (error.code === 'LIMIT_FILE_SIZE') {
      return errorResponse(res, 400, 'File too large. Maximum size is 5MB.');
    }
    return errorResponse(res, 400, error.message);
  }
  if (error.message.includes('Invalid file type')) {
    return errorResponse(res, 400, error.message);
  }
  next(error);
});

module.exports = router;
