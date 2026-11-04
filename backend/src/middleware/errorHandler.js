function notFoundHandler(req, res) {
  return res.status(404).json({ success: false, message: 'Route not found' });
}

function globalErrorHandler(err, req, res, next) {
  console.error(err);

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
