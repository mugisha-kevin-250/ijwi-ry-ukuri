const mongoose = require('mongoose');

const articleViewSchema = new mongoose.Schema({
  articleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', required: true },
  readerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  anonymousSessionId: { type: String, default: null },
  hashedIp: { type: String, default: null },
  userAgent: String,
  viewedAt: { type: Date, default: Date.now },
  readingDuration: { type: Number, default: 0 },
  isValid: { type: Boolean, default: false },
  isSuspicious: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

articleViewSchema.index({ articleId: 1, readerId: 1, viewedAt: -1 });
articleViewSchema.index({ articleId: 1, anonymousSessionId: 1, viewedAt: -1 });
articleViewSchema.index({ hashedIp: 1, articleId: 1, viewedAt: -1 });
articleViewSchema.index({ articleId: 1, isValid: 1 });
// The trending calculation walks a window of recent reads across every story,
// so it needs the time first. Without this the whole history would be scanned
// once a minute to answer a shelf of ten.
articleViewSchema.index({ viewedAt: -1, articleId: 1 });

module.exports = mongoose.model('ArticleView', articleViewSchema);
