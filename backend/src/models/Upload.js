const mongoose = require('mongoose');

// Uploaded media is stored inside the database because the free Render instance
// wipes its filesystem on every redeploy. `data` stays out of default queries so
// listing uploads never drags megabytes across the wire.
const uploadSchema = new mongoose.Schema({
  filename: { type: String, required: true, unique: true },
  contentType: { type: String, required: true },
  size: { type: Number, required: true },
  data: { type: Buffer, required: true, select: false },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdAt: { type: Date, default: Date.now }
});

uploadSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Upload', uploadSchema);
