const mongoose = require('mongoose');

// A reader's address is personal data and the token is the credential that
// proves they own it, so only the sha256 hash of the token is ever stored -
// the raw one exists only inside the email that was mailed.
const newsletterSubscriberSchema = new mongoose.Schema({
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
  status: { type: String, enum: ['pending', 'confirmed', 'unsubscribed'], default: 'pending' },
  // One token doubles as the confirmation link and the unsubscribe link in
  // every alert, which is the legal minimum and one less secret to rotate.
  confirmTokenHash: { type: String, default: null },
  confirmedAt: { type: Date, default: null },
  unsubscribedAt: { type: Date, default: null },
  source: { type: String, trim: true, maxlength: 60, default: 'site' },
}, { timestamps: true });

// One living row per address, so a re-subscribe reactivates instead of mailing
// the same person twice.
newsletterSubscriberSchema.index({ email: 1 }, { unique: true });
newsletterSubscriberSchema.index({ status: 1 });

module.exports = mongoose.model('NewsletterSubscriber', newsletterSubscriberSchema);
