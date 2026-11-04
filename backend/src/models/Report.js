const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  article: { type: mongoose.Schema.Types.ObjectId, ref: 'Article' },
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason: {
    type: String,
    enum: ['misinformation', 'spam', 'inappropriate content', 'copyright issue', 'other'],
    required: true
  },
  details: String,
  status: {
    type: String,
    enum: ['open', 'reviewed', 'resolved'],
    default: 'open'
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

reportSchema.index({ article: 1, status: 1 });

module.exports = mongoose.model('Report', reportSchema);
