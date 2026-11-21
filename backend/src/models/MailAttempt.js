const mongoose = require('mongoose');

/**
 * One press of the send button, and what the mail relay actually said about it.
 *
 * This collection exists because of a gap nobody could see: a reader who
 * subscribes is answered inside three seconds, with "we are mailing you", and
 * the SMTP conversation carries on behind the response. If the relay then
 * refuses - a sender address it does not own, a login it does not recognise, a
 * connection that never opens - the only trace was a line in a log the operator
 * never reads, while the site went on telling readers to check their inbox.
 *
 * So the outcome is written down instead: the relay's own sentence, how long it
 * took, and whether anything was accepted. No full addresses, no secrets, and
 * nothing is kept longer than a month - this is a diagnostic, not an archive.
 */
const mailAttemptSchema = new mongoose.Schema({
  // What the mail was for: 'newsletter-confirm', 'signin-code', 'story-alert',
  // 'test'. Free text because a future template should not need a schema change.
  purpose: { type: String, required: true, trim: true, lowercase: true },
  // The address with its local part reduced to one letter, which is enough to
  // tell "every gmail subscriber is bouncing" from "this one address is wrong".
  recipient: { type: String, trim: true },
  subject: { type: String, trim: true },
  delivered: { type: Boolean, default: false },
  // 'sent' | 'rejected' | 'not-configured' | 'queued' | 'abandoned'
  outcome: { type: String, required: true },
  // The relay's own words, trimmed of control characters and cut short. This is
  // the field that answers "email is not coming".
  reason: { type: String, trim: true },
  messageId: { type: String, trim: true },
  ms: { type: Number },
}, { timestamps: true });

mailAttemptSchema.index({ createdAt: -1 });
mailAttemptSchema.index({ delivered: 1, createdAt: -1 });

module.exports = mongoose.model('MailAttempt', mailAttemptSchema);
