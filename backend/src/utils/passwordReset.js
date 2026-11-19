/**
 * Getting back into an account you locked.
 *
 * A password reset is the one place where a site hands somebody else's front
 * door over, so the rules here are the ones that matter: the code is short-lived,
 * it is never stored in a readable form, guessing it is expensive, and the answer
 * given to the person asking is the same whether or not the address is real.
 *
 * The code is six digits because it has to be read off a phone and typed into a
 * form on that same phone. That is only safe because the attempt ceiling is small
 * and the window is short: ten minutes and five tries is 100,000 possible codes
 * against five guesses, and the fifth failure retires the code outright.
 */
const crypto = require('crypto');
const env = require('../config/env');

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

// A six-digit code is small enough that a plain hash of it can be checked by an
// attacker who stole the database, so the secret the server already holds goes
// into the hash as a pepper. Stealing the column is not enough to read it.
function hashCode(code) {
  return crypto.createHmac('sha256', String(env.JWT_SECRET)).update(String(code)).digest('hex');
}

function mintCode() {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  return { code, codeHash: hashCode(code) };
}

function timingSafeEquals(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Whether a stored record still accepts this code. Returns why it stopped, in
 * words the route can print without telling anybody whether the account exists.
 */
function checkCode(record, submitted) {
  if (!record || !record.resetCodeHash) return { ok: false, reason: 'NO_CODE' };
  if (record.resetCodeAttempts >= MAX_ATTEMPTS) return { ok: false, reason: 'TOO_MANY_ATTEMPTS' };
  if (!record.resetCodeExpires || new Date(record.resetCodeExpires).getTime() < Date.now()) {
    return { ok: false, reason: 'EXPIRED' };
  }
  const code = String(submitted || '').trim();
  if (!/^\d{6}$/.test(code)) return { ok: false, reason: 'BAD_FORMAT' };
  if (!timingSafeEquals(hashCode(code), record.resetCodeHash)) {
    return { ok: false, reason: 'WRONG_CODE', attemptsLeft: MAX_ATTEMPTS - (record.resetCodeAttempts || 0) - 1 };
  }
  return { ok: true };
}

// The fields a reset leaves behind are wiped in the same write that sets the new
// password, so a used code can never be replayed.
function clearedResetFields() {
  return {
    $unset: { resetCodeHash: '', resetCodeExpires: '', resetCodeAttempts: '', resetCodeSentAt: '' },
    $set: { passwordChangedAt: new Date() },
  };
}

// The same wipe on its own, for the paths that have not changed a password: a
// mail the relay refused must not end anybody's session, whatever else it does.
function wipedCodeFields() {
  return { $unset: { resetCodeHash: '', resetCodeExpires: '', resetCodeAttempts: '', resetCodeSentAt: '' } };
}

function newResetFields(codeHash) {
  const now = new Date();
  return {
    resetCodeHash: codeHash,
    resetCodeExpires: new Date(now.getTime() + CODE_TTL_MS),
    resetCodeAttempts: 0,
    resetCodeSentAt: now,
  };
}

function resendIsCoolingDown(sentAt) {
  if (!sentAt) return false;
  return Date.now() - new Date(sentAt).getTime() < RESEND_COOLDOWN_MS;
}

module.exports = {
  CODE_TTL_MS,
  RESEND_COOLDOWN_MS,
  MAX_ATTEMPTS,
  mintCode,
  hashCode,
  checkCode,
  clearedResetFields,
  wipedCodeFields,
  newResetFields,
  resendIsCoolingDown,
};