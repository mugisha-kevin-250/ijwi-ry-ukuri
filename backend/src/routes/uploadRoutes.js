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

// Handle multer errors
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
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
