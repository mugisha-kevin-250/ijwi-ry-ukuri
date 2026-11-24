const mongoose = require('mongoose');

const releaseSchema = new mongoose.Schema({
  artist: { type: mongoose.Schema.Types.ObjectId, ref: 'MusicArtist', required: true, index: true },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, trim: true, maxlength: 1500, default: '' },
  genre: { type: String, trim: true, maxlength: 60, default: '' },
  language: { type: String, trim: true, maxlength: 40, default: '' },
  artworkUrl: { type: String, trim: true, maxlength: 500, default: '' },
  listeningUrl: { type: String, required: true, trim: true, maxlength: 500 },
  rightsBasis: { type: String, enum: ['owner', 'written_permission', 'licensed'], required: true },
  rightsDeclaration: { type: Boolean, required: true, validate: value => value === true },
  downloadAllowed: { type: Boolean, default: false },
  featured: { type: Boolean, default: false, index: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'takedown_pending', 'removed'], default: 'pending', index: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  reviewNote: { type: String, trim: true, maxlength: 1000, default: '' },
  takedownReason: { type: String, trim: true, maxlength: 1500, default: '' },
}, { timestamps: true });

releaseSchema.index({ status: 1, featured: -1, createdAt: -1 });
module.exports = mongoose.model('MusicRelease', releaseSchema);
