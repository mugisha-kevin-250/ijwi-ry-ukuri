const mongoose = require('mongoose');

// Persist API refresh timing and quota headers across Render restarts. This
// prevents a restart or second instance from repeatedly spending the free quota.
const schema = new mongoose.Schema({
  _id: { type: String, default: 'world-news-api' },
  lastAttemptAt: Date,
  lastSuccessAt: Date,
  nextAllowedAt: Date,
  quotaRequest: String,
  quotaUsed: String,
  quotaLeft: String,
  lastError: { type: String, maxlength: 300, default: '' },
}, { versionKey: false });
module.exports = mongoose.models.GlobalNewsSyncState
  || mongoose.model('GlobalNewsSyncState', schema);
