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
app.use('/uploads', express.static(env.UPLOAD_DIR));

app.use(notFoundHandler);
app.use(globalErrorHandler);

module.exports = app;
