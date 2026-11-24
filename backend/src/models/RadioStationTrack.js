const mongoose = require('mongoose');
const radioStationTrackSchema = new mongoose.Schema({
  audiusId: { type: String, required: true, unique: true, trim: true, maxlength: 100 },
  title: { type: String, required: true, trim: true, maxlength: 240 },
  artist: { type: String, default: '', trim: true, maxlength: 180 },
  artwork: { type: String, default: '', maxlength: 1000 },
  duration: { type: Number, default: 0, min: 0 },
  permalink: { type: String, default: '', maxlength: 1000 },
  active: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
radioStationTrackSchema.index({ active: 1, sortOrder: 1, createdAt: 1 });
module.exports = mongoose.model('RadioStationTrack', radioStationTrackSchema);
