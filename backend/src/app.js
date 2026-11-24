const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const { notFoundHandler, globalErrorHandler } = require('./middleware/errorHandler');
const authRoutes = require('./routes/authRoutes');
const publicRoutes = require('./routes/publicRoutes');
const writerRoutes = require('./routes/writerRoutes');
const adminRoutes = require('./routes/adminRoutes');
const auditRoutes = require('./routes/auditRoutes');
const articleRoutes = require('./routes/articleRoutes');
const editorRoutes = require('./routes/editorRoutes');
const assignmentRoutes = require('./routes/assignmentRoutes');
const userRoutes = require('./routes/userRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const pushRoutes = require('./routes/pushRoutes');
const liveRoutes = require('./routes/liveRoutes');
const radioRoutes = require('./routes/radioRoutes');
const musicRoutes = require('./routes/musicRoutes');
const newsletterRoutes = require('./routes/newsletterRoutes');
const translateRoutes = require('./routes/translateRoutes');
const scoreRoutes = require('./routes/scoreRoutes');
const weatherRoutes = require('./routes/weatherRoutes');
const globalNewsRoutes = require('./routes/globalNewsRoutes');
const aiRoutes = require('./routes/aiRoutes');
const uploadStore = require('./services/uploadStore');
const clientIp = require('./utils/clientIp');

const env = require('./config/env');

const app = express();

// CORS is checked before every route, including error responses and OPTIONS
// preflights. Normalize configured URLs so a trailing slash, uppercase host,
// or explicit default port in Render's CLIENT_URL does not accidentally make
// the browser origin fail an exact string comparison.
const normalizeOrigin = (value) => {
  try {
    const parsed = new URL(String(value).trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
};

const allowedOrigins = new Set([
  ...env.CLIENT_URL.split(/[,;]/).map(normalizeOrigin),
  'https://www.radartimes.2bd.net',
  'https://radartimes.2bd.net',
  'https://ijwi-ry--ukuri.web.app',
  'https://ijwi-ry--ukuri.firebaseapp.com',
].filter(Boolean));

const corsOptions = {
  origin: (origin, callback) => {
    // Requests without an Origin header (curl, server-to-server, health checks)
    // are not browser cross-origin requests and can continue normally.
    if (!origin) return callback(null, true);

    const normalizedOrigin = normalizeOrigin(origin);
    if (normalizedOrigin && allowedOrigins.has(normalizedOrigin)) {
      return callback(null, true);
    }

    // Do not reflect an unknown origin. Log it so a rejected production origin
    // can be identified from Render logs without guessing or opening CORS to *.
    console.warn(`[cors] Rejected browser origin: ${JSON.stringify(origin)}`);
    return callback(null, false);
  },
  credentials: true,
  optionsSuccessStatus: 204,
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  // The scores page asks a question every thirty seconds while a reader is
  // looking at it, and it is answered from our own database rather than by
  // reading the news. Left in the shared ceiling, one fan watching a match would
  // spend the requests of the whole office behind his carrier's address and the
  // news pages would start refusing to load. Scores get their own, much wider,
  // ceiling below.
  skip: (req) => req.path.startsWith('/scores'),
  message: { success: false, message: 'Too many requests, please try again later.' }
});
app.use('/api', limiter);

// Reading the news is cheap; these three are not. Sign-in attempts can be
// guessed at, uploads cost disk and processing, and every AI draft costs a paid
// call with a 90 second timeout - so each gets its own much smaller ceiling and
// is keyed on the reader's address rather than the shared proxy address.
const byClientIp = { keyGenerator: (req) => clientIp(req) || req.ip };

// Audius search and the public audio proxy are provider/bandwidth operations.
// Keep them separate from the general API ceiling so one listener or scraper
// cannot consume the whole newsroom's request budget.
const audiusLimiter = rateLimit({
  ...byClientIp,
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many radio requests. Please try again in a few minutes.' }
});

const tooMany = (text) => ({ success: false, message: text });

const authLimiter = rateLimit({
  ...byClientIp,
  windowMs: 15 * 60 * 1000,
  // Only failures count, so a whole office behind one address can still sign in.
  max: 20,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany('Too many attempts from this address, please try again in a few minutes.')
});

const uploadLimiter = rateLimit({
  ...byClientIp,
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany('Too many uploads, please try again later.')
});

const aiLimiter = rateLimit({
  ...byClientIp,
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany('The AI writer is limited to 10 stories an hour, please try again later.')
});

// Research is a conversation, so it gets a wider ceiling than story-writing:
// thirty questions an hour is a working session, and the answers are only ever
// leads an admin still has to check.
const aiChatLimiter = rateLimit({
  ...byClientIp,
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany('The research desk has answered enough questions for this hour, please try again later.')
});

// RADAR AI answers readers, and a reader is a stranger. The ceiling is the one
// the desk itself publishes, because the chat page prints that number to the
// reader and a page that names a limit the server does not enforce is lying in
// both directions. Story-writing for staff stays on the narrower ceilings above.
const readerAiLimiter = rateLimit({
  ...byClientIp,
  windowMs: 60 * 60 * 1000,
  max: aiRoutes.QUESTIONS_PER_HOUR,
  standardHeaders: true,
  legacyHeaders: false,
  // "Please ask again later" on a stranger's desk is a locked door with no
  // clock on it, and a reader who has just been told to rephrase a perfectly
  // good question will assume the feature is broken. This ceiling runs on a
  // fixed window whose turnover the server knows, so the reader gets the
  // minutes instead, and the header goes out for anything that reads those.
  message: (req, res) => {
    const resetAt = req.rateLimit?.resetTime ? new Date(req.rateLimit.resetTime).getTime() : Date.now() + 60000;
    const minutes = Math.max(1, Math.ceil((resetAt - Date.now()) / 60000));
    if (res && typeof res.set === 'function') res.set('Retry-After', String(minutes * 60));
    return tooMany(`RADAR AI has answered ${aiRoutes.QUESTIONS_PER_HOUR} questions from this address in one hour. Ask again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`);
  }
});

// An open form is the one place on a news site where a stranger can write into the
// database, so it gets both the honeypot in the page and this ceiling.
const contactLimiter = rateLimit({
  ...byClientIp,
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany('That is more than the newsroom can take from one address in an hour. Please try again later.')
});

// Password reset asks the server to mail someone, so it is guarded like sign-in.
for (const path of [
  '/api/auth/login',
  '/api/auth/admin-login',
  '/api/auth/register',
  '/api/auth/google',
  '/api/auth/credentials',
  '/api/auth/forgot-password',
  '/api/auth/reset-password'
]) {
  app.use(path, authLimiter);
}
app.use('/api/upload', uploadLimiter);
app.post('/api/admin/ai/generate', aiLimiter);
app.post('/api/admin/ai/trends', aiLimiter);
app.post('/api/admin/ai/articles', aiLimiter);
app.post('/api/admin/ai/chat', aiChatLimiter);
app.post('/api/admin/ai/photos', aiLimiter);
// The same AI writer an admin uses, opened to staff authors: a draft costs the
// newsroom a paid call, so it shares the story-writing ceiling rather than the
// reader one. Publishing is still a person's decision, made in their own
// dashboard - nothing here writes to the site by itself.
app.post('/api/writers/ai/generate', aiLimiter);
// An ad creative is a short call and a person often wants to see two or three
// before picking one, so it shares the research desk's wider ceiling rather than
// the story writer's ten an hour.
app.post('/api/admin/ads/generate', aiChatLimiter);
app.post('/api/contact', contactLimiter);
// Subscribing costs an email, so it shares the open form's ceiling. The
// confirm and unsubscribe links are GETs a reader opens from an old mail and
// stay unthrottled.
app.post('/api/newsletter/subscribe', contactLimiter);
// Closing an account is one press, and the password is the only thing in front
// of it, so the ceiling counts failed attempts from an address rather than the
// reader's own - a wrong guess is the thing worth limiting here.
const accountCloseLimiter = rateLimit({
  ...byClientIp,
  windowMs: 60 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany('Too many tries from this address. Please come back in a while.')
});
app.delete('/api/users/me', accountCloseLimiter);
// Translating the site's own labels is the one translation call a reader can
// ask for on their own, so it is capped. It is a one-off per language per
// browser, and the server only ever pays Google for the first reader.
const translateLimiter = rateLimit({
  ...byClientIp,
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany('Too many translation requests from this address, please try again later.')
});
app.post('/api/translate/chrome', translateLimiter);

// The scores page is the only part of the site a reader polls, so it is the only
// part that has to be judged in requests-per-minute rather than per hour: one
// fan watching a match asks two questions a minute, and an office behind one
// carrier address has a hundred of them. The ceiling is therefore wide - 40 a
// minute per address - while still being a ceiling, because every request that
// arrives for a league this database has never seen costs an upstream call, and
// the free feed we read is only free while we ask it politely.
const scoresLimiter = rateLimit({
  ...byClientIp,
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany('The scores page is catching up, please wait a moment before asking again.')
});

// The weather page is read once per visit rather than polled, so a modest ceiling
// per address is enough to stop a script turning one reader's curiosity into a
// hundred different cities - and every city this database has not seen costs the
// newsroom one call against a monthly quota the whole site shares.
const weatherLimiter = rateLimit({
  ...byClientIp,
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany('The weather desk is catching up, please try again in a minute.')
});

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'StudentNews API',
      version: '1.0.0',
      description: 'Backend API for public newsroom and writer rewards.'
    },
    servers: [{ url: '/' }]
  },
  apis: ['./src/routes/*.js']
};
if (env.NODE_ENV !== 'production') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerJsdoc(swaggerOptions)));
}

app.get('/api/health', (req, res) => {
  // Which desks this server can actually run. Every value here is a boolean or
  // the NAME of a variable that is missing - never a key, a password or an
  // address - because this route answers without a login. It exists so an
  // operator can see from outside why recovery mail or the weather page gave up,
  // instead of reading a Render log to find a typo in one variable name.
  const mail = require('./services/mailerService');
  const mailState = mail.status();
  res.json({
    success: true,
    message: 'StudentNews API is running',
    // The commit this process was built from. Render gives every service its
    // git sha in the environment, so an operator can tell from outside whether
    // the fix that was just pushed is the code that is answering - the
    // difference between waiting for a redeploy and finding a real bug.
    commit: String(process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || '').slice(0, 40) || null,
    wired: {
      email: mailState.configured,
      // The variable to set, when email is false: SMTP_HOST or MAIL_FROM_EMAIL.
      emailReason: mailState.reason || null,
      // A relay can be addressed and still have no credentials, which is legal
      // for a server that only mails its own domain. Named, never valued, for
      // exactly the reason the two lines above are.
      emailWarning: mailState.warning || null,
      push: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
      ai: Boolean(env.GEMINI_API_KEY),
      weather: Boolean(env.WEATHERAPI_KEY),
      translate: Boolean(env.GOOGLE_TRANSLATE_API_KEY),
    },
  });
});

app.use('/api/auth', authRoutes);
// Mounted before the public routes so /api/translate is answered here and not
// swallowed by the catch-all story endpoints.
app.use('/api/translate', translateRoutes);
// The scores page is read twice a minute by every fan on the page and answered
// from our own database, so it is mounted here - ahead of the catch-all public
// story routes - with its own ceiling instead of the shared one.
app.use('/api/scores', scoresLimiter, scoreRoutes);
// Same reason as the scores page, and the same place: mounted ahead of the
// catch-all public story routes so /api/weather is answered here.
app.use('/api/weather', weatherLimiter, weatherRoutes);
// Global feed metadata is public; refresh and diagnostics remain protected inside the router.
app.use('/api/global-news', globalNewsRoutes);
// RADAR AI is a public feature, and it is mounted ahead of the catch-all public
// story routes for the same reason the weather desk is: /api/ai has to be
// answered here, with its own ceiling, before the story endpoints see the path.
app.use('/api/ai', readerAiLimiter, aiRoutes);
// Assignment paths must be mounted before the public story router, whose
// catch-all article routes would otherwise consume /api/assignments.
app.use('/api/assignments', assignmentRoutes);
app.use('/api', publicRoutes);
app.use('/api/writers', writerRoutes);
app.use('/api/editor', editorRoutes);
app.use('/api/users', userRoutes);
// A separate, permission-gated activity endpoint keeps the immutable audit
// trail independent from the admin router's existing feature surface.
app.use('/api/admin/audit-logs', auditRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/articles', articleRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/live', liveRoutes);
// The radio timetable is read by every visitor, and building an edition is slow
// enough on a cold database that it gets its own address rather than joining the
// catch-all public story routes.
app.use('/api/radio/audius', audiusLimiter);
app.use('/api/radio', radioRoutes);
// Public play-count writes are rate-limited separately so one client cannot inflate charts.
const musicListenLimiter = rateLimit({ ...byClientIp, windowMs: 60 * 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false, message: tooMany('Too many music listen events from this address. Please try again later.') });
app.post('/api/music/releases/:id/listen', musicListenLimiter);
app.use('/api/music', musicRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/uploads', express.static(env.UPLOAD_DIR));
// Render's disk is wiped on redeploy, so anything the cache lost is read back
// from the database copy.
app.get('/uploads/:filename', uploadStore.serve);

app.use(notFoundHandler);
app.use(globalErrorHandler);

module.exports = app;
