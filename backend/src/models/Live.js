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
  peakViewers: { type: Number, default: 0 },
  // 'camera' is the peer-to-peer broadcast this model was built for. The other
  // three are a link the admin put on air instead, which is a different thing
  // to operate: nothing is captured here, and the players are somebody else's
  // servers. Which one it was decides what the reader's page embeds, so it is
  // stored rather than re-guessed from the address on every load.
  source: { type: String, enum: ['camera', 'youtube', 'vimeo', 'facebook', 'instagram', 'tiktok', 'file'], default: 'camera' },
  // What the admin pasted, kept so the credit line can name the real video
  // rather than an opaque embed. `embedUrl` is what the page is allowed to load
  // and is rebuilt from the video id, never taken from the request.
  videoUrl: { type: String, default: '' },
  watchUrl: { type: String, default: '' },
  embedUrl: { type: String, default: '' }
}, { timestamps: true });

liveSchema.index({ status: 1, startedAt: -1 });

module.exports = mongoose.model('Live', liveSchema);
