const env = require('../config/env');

function notFoundHandler(req, res) {
  return res.status(404).json({ success: false, message: 'Route not found' });
}

function globalErrorHandler(err, req, res, next) {
  // An Error can carry whatever the failing call was given - an upstream URL,
  // its options object, a key in the cause chain - so the whole object is never
  // printed. The route and the message are enough to debug from.
  const route = `${req.method} ${String(req.path || req.url || '').split('?')[0]}`;
  console.error(`[error] ${route}: ${err.message || err.name || 'Unknown error'}`);
  if (env.NODE_ENV !== 'production' && err.stack) console.error(err.stack);

  if (err.name === 'ValidationError') {
    return res.status(400).json({ success: false, message: err.message });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({ success: false, message: 'Invalid ID format' });
  }

  if (err.code === 11000) {
    return res.status(409).json({ success: false, message: 'Duplicate value found' });
  }

  return res.status(500).json({ success: false, message: 'Internal server error' });
}

module.exports = { notFoundHandler, globalErrorHandler };
