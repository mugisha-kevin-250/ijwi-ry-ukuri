const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

module.exports = {
  PORT: process.env.PORT || 5000,
  MONGODB_URI: process.env.MONGODB_URI || '',
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-key',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  // Render wipes the source tree on each deploy, so uploads must live on a mounted disk.
  UPLOAD_DIR: process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads'),
  // Media already referenced by the database is copied onto an empty UPLOAD_DIR at boot.
  SEED_UPLOADS_DIR: process.env.SEED_UPLOADS_DIR || path.join(__dirname, '../../uploads'),
  PUBLIC_URL: process.env.PUBLIC_URL || '',
  // Uploaded images are stored in MongoDB, which survives a redeploy; the disk
  // copy below is only a cache. This caps the collection so the free 512MB
  // cluster cannot be filled silently and take the whole database down.
  UPLOAD_STORE_LIMIT_MB: Number(process.env.UPLOAD_STORE_LIMIT_MB || 400),
  // Google Identity Services client id. Must match the frontend's
  // VITE_GOOGLE_CLIENT_ID, since it is the token audience we verify.
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  // Web Push (VAPID). The private key stays in the gitignored env files.
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY || '',
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || '',
  VAPID_SUBJECT: process.env.VAPID_SUBJECT || 'https://ijwi-ry--ukuri.web.app',
  RATE_PER_1000_VIEWS: Number(process.env.RATE_PER_1000_VIEWS || 5000),
  MINIMUM_PAYOUT: Number(process.env.MINIMUM_PAYOUT || 10000),
  NODE_ENV: process.env.NODE_ENV || 'development'
};
