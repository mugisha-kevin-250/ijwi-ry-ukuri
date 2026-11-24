const mongoose = require('mongoose');

const playlistSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  description: { type: String, trim: true, maxlength: 300, default: '' },
  releases: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MusicRelease' }],
  isPublic: { type: Boolean, default: false },
}, { timestamps: true });

playlistSchema.index({ user: 1, name: 1 }, { unique: true });
module.exports = mongoose.model('MusicPlaylist', playlistSchema);
