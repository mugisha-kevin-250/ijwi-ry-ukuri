const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const env = require('../config/env');

const router = express.Router();

const uploadDir = env.UPLOAD_DIR;
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed.'), false);
  }
  cb(null, true);
};

const upload = multer({ 
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE }
});

router.post('/image', protect, upload.single('image'), (req, res) => {
  if (!req.file) return errorResponse(res, 400, 'No file uploaded');
  const fileUrl = `/uploads/${req.file.filename}`;
  return successResponse(res, 200, 'Uploaded', { url: fileUrl });
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
