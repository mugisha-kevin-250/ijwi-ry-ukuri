const mongoose = require('mongoose');

const artistSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  stageName: { type: String, required: true, trim: true, maxlength: 100 },
  biography: { type: String, trim: true, maxlength: 2000, default: '' },
  country: { type: String, trim: true, maxlength: 80, default: '' },
  genres: [{ type: String, trim: true, maxlength: 40 }],
  officialUrl: { type: String, trim: true, maxlength: 500, default: '' },
  status: { type: String, enum: ['pending', 'verified', 'rejected', 'suspended'], default: 'pending', index: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  reviewNote: { type: String, trim: true, maxlength: 1000, default: '' },
}, { timestamps: true });

artistSchema.index({ status: 1, stageName: 1 });
module.exports = mongoose.model('MusicArtist', artistSchema);
