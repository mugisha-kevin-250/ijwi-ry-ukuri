const mongoose = require('mongoose');

const listenSchema = new mongoose.Schema({
  release: { type: mongoose.Schema.Types.ObjectId, ref: 'MusicRelease', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  listenedAt: { type: Date, default: Date.now, index: true },
}, { timestamps: false });

listenSchema.index({ user: 1, listenedAt: -1 });
module.exports = mongoose.model('MusicListen', listenSchema);
