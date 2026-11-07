const mongoose = require('mongoose');

const liveCommentSchema = new mongoose.Schema({
  live: { type: mongoose.Schema.Types.ObjectId, ref: 'Live', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  text: { type: String, required: true, maxlength: 300, trim: true },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

liveCommentSchema.index({ live: 1, createdAt: -1 });

module.exports = mongoose.model('LiveComment', liveCommentSchema);
