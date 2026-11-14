const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

// A token signed with a key that is in a public repository is not a token at
// all, so production refuses to boot without its own secret. Local development
// keeps a fixed key so a fresh clone runs with no .env file.
const DEV_JWT_SECRET = 'dev-secret-key';
const isProduction = process.env.NODE_ENV === 'production';
const jwtSecret = process.env.JWT_SECRET || (isProduction ? '' : DEV_JWT_SECRET);
if (!jwtSecret) {
  throw new Error('JWT_SECRET is required in production - set it to a key only this server knows.');
}

module.exports = {
  PORT: process.env.PORT || 5000,
  MONGODB_URI: process.env.MONGODB_URI || '',
  JWT_SECRET: jwtSecret,
  // Tokens are always HMAC-signed with this one algorithm; a verify call that
  // accepts whatever the token claims lets a forged algorithm through.
  JWT_ALGORITHM: 'HS256',
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
  // Gemini writes the admin's story drafts. The key only ever lives here, on
  // the server; without it the AI writer stays hidden in the admin portal.
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-flash-lite-latest',
  GEMINI_TIMEOUT_MS: Number(process.env.GEMINI_TIMEOUT_MS || 90000),
  // A research answer is shorter than a story, so it waits for less time. The
  // chat is the one AI call an admin can make many times in a sitting.
  GEMINI_CHAT_TIMEOUT_MS: Number(process.env.GEMINI_CHAT_TIMEOUT_MS || 45000),
  // What readers are searching for right now, read from Google's own feed on the
  // server. No secret is involved and nothing is sent to the browser.
  TREND_GEOS: process.env.TREND_GEOS || '',
  TREND_CACHE_MINUTES: Number(process.env.TREND_CACHE_MINUTES || 15),
  TREND_TIMEOUT_MS: Number(process.env.TREND_TIMEOUT_MS || 15000),
  RATE_PER_1000_VIEWS: Number(process.env.RATE_PER_1000_VIEWS || 5000),
  MINIMUM_PAYOUT: Number(process.env.MINIMUM_PAYOUT || 10000),
  // Email alerts. Like VAPID, a missing value is a supported state: every
  // newsletter route reports that email is not configured instead of
  // pretending a mail went out. SMTP_SECURE is true only for an implicit-TLS
  // port (465); 587 stays on STARTTLS.
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: Number(process.env.SMTP_PORT || 587),
  SMTP_SECURE: process.env.SMTP_SECURE === 'true',
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASSWORD: process.env.SMTP_PASSWORD || '',
  MAIL_FROM_EMAIL: process.env.MAIL_FROM_EMAIL || '',
  MAIL_FROM_NAME: process.env.MAIL_FROM_NAME || '',
  // Google Cloud Translation. A reader picks any language the service knows and
  // the news is delivered in it. No key means no translation: every read then
  // returns the English original and the page says why, which is a supported
  // state rather than a failure. The key never leaves the server.
  GOOGLE_TRANSLATE_API_KEY: process.env.GOOGLE_TRANSLATE_API_KEY || '',
  TRANSLATE_TIMEOUT_MS: Number(process.env.TRANSLATE_TIMEOUT_MS || 12000),
  // Long articles are sent in pieces. This is the piece size, not a cap on the
  // story - a story longer than TRANSLATE_MAX_CHARS is still translated whole.
  TRANSLATE_CHUNK_CHARS: Number(process.env.TRANSLATE_CHUNK_CHARS || 4000),
  // A cost ceiling, not a feature: one reader asking for a 200,000-word document
  // is refused instead of quietly spending the newsroom's quota.
  TRANSLATE_MAX_CHARS: Number(process.env.TRANSLATE_MAX_CHARS || 60000),
  NODE_ENV: process.env.NODE_ENV || 'development',
  // The weekly pay ledger and scheduled stories only move if some process wakes
  // up for them. Onwards unless the operator turns it off - a second instance
  // sharing one database should set this to false so pay is not computed twice.
  ENABLE_SCHEDULER: process.env.ENABLE_SCHEDULER !== 'false',
  // Which zone "Monday just after midnight" means. Kigali time is the newsroom.
  SCHEDULER_TZ: process.env.SCHEDULER_TZ || 'Africa/Kigali',
  // Which clock the radio timetable is written on. Kept separate from the pay
  // schedule's zone because they are two different human decisions: one is an
  // accounting week, the other is when the newsreader starts talking. The
  // timetable document can override this per station.
  RADIO_TZ: process.env.RADIO_TZ || 'Africa/Kigali'
};
