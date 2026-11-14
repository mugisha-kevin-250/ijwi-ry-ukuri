const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  article: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true, trim: true },
  // "reported" is a reader asking a human to look, not a verdict: a reported
  // comment stays on the page until staff act, so the queue and the thread can
  // show the same thing. Only staff move a comment to "hidden", and who did it
  // is recorded because a takedown has to be answerable later.
  status: {
    type: String,
    enum: ['active', 'hidden', 'reported', 'deleted'],
    default: 'active'
  },
  reportedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  reportReason: { type: String, default: '', trim: true, maxlength: 300 },
  moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  moderatedAt: { type: Date, default: null },
  moderationNote: { type: String, default: '', trim: true, maxlength: 500 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

commentSchema.index({ article: 1, createdAt: -1 });
// The moderation queue is one filter on status plus a newest-first scroll, and
// it is read by staff on every visit to the page.
commentSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Comment', commentSchema);
