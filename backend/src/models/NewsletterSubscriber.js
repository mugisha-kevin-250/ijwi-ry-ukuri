const mongoose = require('mongoose');

// A reader's address is personal data and the token is the credential that
// proves they own it, so only the sha256 hash of the token is ever stored -
// the raw one exists only inside the email that was mailed.
const newsletterSubscriberSchema = new mongoose.Schema({
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
  status: { type: String, enum: ['pending', 'confirmed', 'unsubscribed'], default: 'pending' },
  // The account this address belongs to, when the reader was signed in while
  // asking for alerts. It is not how the row is found - the address is - but it
  // is how the account screen knows the row is its own, and how a closed account
  // can be sure it took the mail list with it.
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // Which desks the reader wants mail about. An empty list is not "nothing", it
  // is "the whole newsroom", which is what somebody who never chose is asking for.
  sections: [{ type: String, trim: true, lowercase: true, maxlength: 60 }],
  // The language the reader's own alerts are written in. The story inside the
  // mail is in the language the newsroom published it; this decides the words
  // around it.
  language: { type: String, trim: true, lowercase: true, maxlength: 8, default: 'en' },
  // Two tokens, because they prove two different things. This one is the answer
  // to "did the person who clicked actually own the address", and it is minted
  // afresh with every mail so the newest message always has a live link.
  confirmTokenHash: { type: String, default: null },
  // And this one is only ever the stop link: it does not confirm anything, and it
  // is what a mail client's one-click unsubscribe button is pointed at.
  unsubscribeTokenHash: { type: String, default: null },
  confirmedAt: { type: Date, default: null },
  unsubscribedAt: { type: Date, default: null },
  source: { type: String, trim: true, maxlength: 60, default: 'site' },
}, { timestamps: true });

// One living row per address, so a re-subscribe reactivates instead of mailing
// the same person twice.
newsletterSubscriberSchema.index({ email: 1 }, { unique: true });
newsletterSubscriberSchema.index({ status: 1 });
newsletterSubscriberSchema.index({ user: 1 });

module.exports = mongoose.model('NewsletterSubscriber', newsletterSubscriberSchema);
