const mongoose = require('mongoose');

const followSchema = new mongoose.Schema({
  follower: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  writer: { type: mongoose.Schema.Types.ObjectId, ref: 'WriterProfile', required: true },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

followSchema.index({ follower: 1, writer: 1 }, { unique: true });

module.exports = mongoose.model('Follow', followSchema);
