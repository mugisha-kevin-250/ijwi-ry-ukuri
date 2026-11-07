const mongoose = require('mongoose');

// One broadcast at a time: the admin opens the camera, everybody else watches.
// Media never touches this server (it is peer-to-peer), so the only things worth
// storing are the announcement itself and how many people turned up.
const liveSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['active', 'ended'], default: 'active' },
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date, default: null },
  // Total joins over the whole broadcast, and the highest simultaneous audience.
  views: { type: Number, default: 0 },
  viewers: { type: Number, default: 0 },
  peakViewers: { type: Number, default: 0 }
}, { timestamps: true });

liveSchema.index({ status: 1, startedAt: -1 });

module.exports = mongoose.model('Live', liveSchema);
