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
  // Ask the model to look the answer up on the open web before it speaks. This
  // is off by default for two honest reasons: the free-tier key this newsroom
  // runs on does not offer search grounding to every model, and a reader asking
  // "how do I publish on RADAR" must be answered from our own handbook, not
  // from whatever a search page says about us. Switch it on together with a
  // model that supports it (GEMINI_MODEL=gemini-2.5-flash) when the newsroom
  // wants the AI desk to cite the wider web.
  GEMINI_GROUND_SEARCH: process.env.GEMINI_GROUND_SEARCH === 'true',
  // What readers are searching for right now, read from Google's own feed on the
  // server. No secret is involved and nothing is sent to the browser.
  TREND_GEOS: process.env.TREND_GEOS || '',
  // Operator-managed, licensed/permissioned RSS feeds. JSON array of {url,name,region,language}.
  GLOBAL_NEWS_FEEDS: process.env.GLOBAL_NEWS_FEEDS || '[]',
  TREND_CACHE_MINUTES: Number(process.env.TREND_CACHE_MINUTES || 15),
  TREND_TIMEOUT_MS: Number(process.env.TREND_TIMEOUT_MS || 15000),
  RATE_PER_1000_VIEWS: Number(process.env.RATE_PER_1000_VIEWS || 5000),
  MINIMUM_PAYOUT: Number(process.env.MINIMUM_PAYOUT || 10000),
  // Email alerts. Like VAPID, a missing value is a supported state: every
  // newsletter route reports that email is not configured instead of
  // pretending a mail went out. SMTP_SECURE is true only for an implicit-TLS
  // port (465); 587 and 2525 stay on STARTTLS.
  //
  // Provider dashboards do not agree on the names. Brevo's SMTP screen prints
  // SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS, while this file has always
  // read SMTP_PASSWORD - so the second spelling is accepted here too. A reader
  // whose recovery mail never arrived because the key went in under the other
  // name is not something the newsroom can see from the site, and an alias
  // costs nothing.
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: Number(process.env.SMTP_PORT || 587),
  SMTP_SECURE: process.env.SMTP_SECURE === 'true',
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASSWORD: process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '',
  // Mailjet's transactional send API, which logs in with the same API-key and
  // secret pair its SMTP relay does - so these two names are optional. When
  // they are set (or when SMTP_HOST says mailjet, in which case the SMTP user
  // and password already are the pair) a mail leaves over ordinary HTTPS
  // instead of port 587, and a host that blocks or stalls outbound SMTP stops
  // being able to look like a broken newsroom.
  MAILJET_API_KEY: process.env.MAILJET_API_KEY || process.env.MAILJET_USER || '',
  MAILJET_SECRET: process.env.MAILJET_SECRET || process.env.MAILJET_KEY || '',
  // The address a mail is signed from has to be one the sending provider has
  // verified for this account, so it is never guessed here; it is only looked
  // for under the names an operator is likely to have typed.
  MAIL_FROM_EMAIL: process.env.MAIL_FROM_EMAIL || process.env.SMTP_FROM || process.env.EMAIL_FROM || '',
  MAIL_FROM_NAME: process.env.MAIL_FROM_NAME || '',
  // How long a reader may be made to wait on a button while the mail relay is
  // being talked to. The address is stored first and the mail answers later, so
  // this is only the patience budget of a Subscribe press - a slow relay must
  // not be able to turn into "we could not reach the newsroom".
  MAIL_ANSWER_BUDGET_MS: Number(process.env.MAIL_ANSWER_BUDGET_MS || 3000),
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
  RADIO_TZ: process.env.RADIO_TZ || 'Africa/Kigali',
  // Optional Audius read-only API key; kept on the server, never sent to clients.
  AUDIUS_API_KEY: process.env.AUDIUS_API_KEY || '',
  // Live football scores. There is no key, no account and no quota here: ESPN
  // publishes its scoreboard, results and tables as plain JSON, and OUR server is
  // the only thing that ever asks for it. A reader talks to RADAR and never to a
  // sports site, so a thousand people on the scores page cost one upstream call a
  // minute instead of a thousand, and no reader's address can be blocked for it.
  ESPN_BASE_URL: process.env.ESPN_BASE_URL || 'https://site.api.espn.com/apis',
  // Which competitions the page offers, in the order a reader sees them. Empty
  // means the list built into the service, so adding a league is an environment
  // change on Render rather than a rebuild of the site.
  LIVESCORE_LEAGUES: process.env.LIVESCORE_LEAGUES || '',
  LIVESCORE_TIMEOUT_MS: Number(process.env.LIVESCORE_TIMEOUT_MS || 12000),
  // How long a stored scoreboard is accepted before somebody has to ask again, and
  // how often the cron wakes for the leagues readers are actually looking at.
  // Sixty seconds is what a scores page is worth: a goal is either on the page or
  // it is stale news.
  LIVESCORE_REFRESH_SECONDS: Number(process.env.LIVESCORE_REFRESH_SECONDS || 60),
  // The weather desk. One free key from https://www.weatherapi.com, held here and
  // never sent to a browser: the quota belongs to the key and the page is read by
  // a crowd, so OUR server asks once per city every few minutes and every reader
  // after that is answered from our own database.
  WEATHERAPI_KEY: process.env.WEATHERAPI_KEY || '',
  WEATHER_BASE_URL: process.env.WEATHER_BASE_URL || 'https://api.weatherapi.com',
  // The city a reader who has not chosen one is shown. Kigali, because that is the
  // newsroom's own weather.
  WEATHER_DEFAULT_CITY: process.env.WEATHER_DEFAULT_CITY || 'Kigali',
  WEATHER_TIMEOUT_MS: Number(process.env.WEATHER_TIMEOUT_MS || 10000),
  // How long a stored forecast is accepted before somebody has to ask again. Ten
  // minutes, not sixty seconds: a city's weather does not move that fast, and the
  // free plan is counted in calls a month rather than a second.
  WEATHER_REFRESH_SECONDS: Number(process.env.WEATHER_REFRESH_SECONDS || 600)
};
