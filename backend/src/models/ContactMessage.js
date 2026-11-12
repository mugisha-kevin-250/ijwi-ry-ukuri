const mongoose = require('mongoose');

// What a reader asks for when they write to the newsroom. The address they sign
// with is kept because the only way to answer is to answer it; nothing else
// about the sender is recorded - no address, no user agent, no fingerprint.
const contactSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
  topic: {
    type: String,
    enum: ['correction', 'story-tip', 'advertising', 'writer-access', 'other'],
    default: 'other',
  },
  message: { type: String, required: true, maxlength: 4000 },
  status: { type: String, enum: ['open', 'answered', 'closed'], default: 'open' },
  handledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  handledAt: { type: Date, default: null },
}, { timestamps: true });

contactSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('ContactMessage', contactSchema);
