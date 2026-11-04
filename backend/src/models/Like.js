const mongoose = require('mongoose');

const likeSchema = new mongoose.Schema({
  article: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

likeSchema.index({ article: 1, user: 1 }, { unique: true });
likeSchema.index({ article: 1, createdAt: -1 });

module.exports = mongoose.model('Like', likeSchema);
