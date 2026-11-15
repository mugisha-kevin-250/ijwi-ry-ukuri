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
const articleRoutes = require('./routes/articleRoutes');
const editorRoutes = require('./routes/editorRoutes');
const userRoutes = require('./routes/userRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const pushRoutes = require('./routes/pushRoutes');
const liveRoutes = require('./routes/liveRoutes');
const radioRoutes = require('./routes/radioRoutes');
const newsletterRoutes = require('./routes/newsletterRoutes');
const translateRoutes = require('./routes/translateRoutes');
const scoreRoutes = require('./routes/scoreRoutes');
const uploadStore = require('./services/uploadStore');
const clientIp = require('./utils/clientIp');

const env = require('./config/env');

const app = express();

const allowedOrigins = env.CLIENT_URL.split(',').map((item) => item.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // No Origin header: same-origin, curl, health checks.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
}));
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
// An ad creative is a short call and a person often wants to see two or three
// before picking one, so it shares the research desk's wider ceiling rather than
// the story writer's ten an hour.
app.post('/api/admin/ads/generate', aiChatLimiter);
app.post('/api/contact', contactLimiter);
// Subscribing costs an email, so it shares the open form's ceiling. The
// confirm and unsubscribe links are GETs a reader opens from an old mail and
// stay unthrottled.
app.post('/api/newsletter/subscribe', contactLimiter);
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
  res.json({ success: true, message: 'StudentNews API is running' });
});

app.use('/api/auth', authRoutes);
// Mounted before the public routes so /api/translate is answered here and not
// swallowed by the catch-all story endpoints.
app.use('/api/translate', translateRoutes);
// The scores page is read twice a minute by every fan on the page and answered
// from our own database, so it is mounted here - ahead of the catch-all public
// story routes - with its own ceiling instead of the shared one.
app.use('/api/scores', scoresLimiter, scoreRoutes);
app.use('/api', publicRoutes);
app.use('/api/writers', writerRoutes);
app.use('/api/editor', editorRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/articles', articleRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/live', liveRoutes);
// The radio timetable is read by every visitor, and building an edition is slow
// enough on a cold database that it gets its own address rather than joining the
// catch-all public story routes.
app.use('/api/radio', radioRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/uploads', express.static(env.UPLOAD_DIR));
// Render's disk is wiped on redeploy, so anything the cache lost is read back
// from the database copy.
app.get('/uploads/:filename', uploadStore.serve);

app.use(notFoundHandler);
app.use(globalErrorHandler);

module.exports = app;
