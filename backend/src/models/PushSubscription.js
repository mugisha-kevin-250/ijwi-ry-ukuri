const mongoose = require('mongoose');

const pushSubscriptionSchema = new mongoose.Schema({
  endpoint: { type: String, required: true },
  p256dh: { type: String, required: true },
  auth: { type: String, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // This device asked to be told without a sound. It belongs to the install and
  // not to the account, because the phone in a pocket or on a bedside table is
  // the thing that decides whether a beep is welcome, and the same reader has
  // two of those that disagree.
  quiet: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

// One browser install posts the same endpoint again on every revisit.
pushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
