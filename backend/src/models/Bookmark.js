const mongoose = require('mongoose');

const bookmarkSchema = new mongoose.Schema({
  article: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

bookmarkSchema.index({ article: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('Bookmark', bookmarkSchema);
