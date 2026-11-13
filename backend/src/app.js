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
app.post('/api/contact', contactLimiter);

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
app.use('/uploads', express.static(env.UPLOAD_DIR));
// Render's disk is wiped on redeploy, so anything the cache lost is read back
// from the database copy.
app.get('/uploads/:filename', uploadStore.serve);

app.use(notFoundHandler);
app.use(globalErrorHandler);

module.exports = app;
