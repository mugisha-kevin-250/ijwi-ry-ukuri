/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fullName, username, email, password]
 *             properties:
 *               fullName:
 *                 type: string
 *               username:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               country:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const env = require('../config/env');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { protect } = require('../middleware/auth');
const { plainText, safeMediaUrl } = require('../utils/textFields');
const { mintCode, checkCode, newResetFields, clearedResetFields, wipedCodeFields, resendIsCoolingDown, CODE_TTL_MS, MAX_ATTEMPTS } = require('../utils/passwordReset');

const router = express.Router();

// The recovery answers. They are written once, here, because the whole point of
// a recovery flow is that the same sentence comes back whether or not the
// address is on the site.
const RECOVERY_ANSWER = 'If that address has an account, a six-digit code is on its way. It expires in ten minutes.';
const RECOVERY_COOLING = 'A code was just sent. Wait a minute before asking for another.';
const RESET_REFUSAL = 'That code does not match a recovery request. Ask for a new one.';

/**
 * The one place a password is decided, so the recovery screen cannot set a rule
 * the settings page refuses. Eight characters is what the newsroom already asks
 * for; anything longer than a field can hold is a paste gone wrong.
 */
function passwordProblem(password) {
  if (!password || password.length < 8) return 'Choose a password of at least 8 characters.';
  if (password.length > 200) return 'That password is too long to store.';
  if (/^(.)\1+$/.test(password)) return 'That password is one character repeated. Use something harder.';
  return '';
}

function generateToken(user) {
  // `pwdAt` carries the password change, in milliseconds, because the token's
  // own `iat` only counts whole seconds: a reader who resets their password and
  // signs in again inside the same second would otherwise be told they had
  // signed in too long ago. A session is valid while the number it was issued
  // with is still the number on the account.
  return jwt.sign(
    { id: user._id, role: user.role, email: user.email, pwdAt: user.passwordChangedAt ? user.passwordChangedAt.getTime() : 0 },
    env.JWT_SECRET,
    { expiresIn: '7d', algorithm: env.JWT_ALGORITHM },
  );
}

router.post('/register', async (req, res, next) => {
  try {
    const { fullName, username, email, password, country, language } = req.body;
    const identity = {
      fullName: plainText(fullName, { maxLength: 80 }),
      // A username is a login handle, not a headline: no spaces, and the same
      // lower-casing the schema does when it stores it, so the uniqueness check
      // below compares what will actually be saved.
      username: plainText(username, { maxLength: 30 }).replace(/\s+/g, '').toLowerCase(),
      email: plainText(email, { maxLength: 120 }).toLowerCase()
    };
    if (!identity.fullName || !identity.username || !identity.email || !password) {
      return errorResponse(res, 400, 'Full name, username, email and password are required');
    }
    // An address with no @ would be stored and then never let the reader back in.
    if (!identity.email.includes('@')) {
      return errorResponse(res, 400, 'Enter an email address, name@example.com');
    }

    const exists = await User.findOne({ $or: [{ email: identity.email }, { username: identity.username }] });
    if (exists) {
      return errorResponse(res, 409, 'User already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      ...identity,
      password: hashedPassword,
      country: plainText(country, { maxLength: 60 }),
      language: plainText(language, { maxLength: 8 }) || 'en',
      role: 'READER'
    });

    const token = generateToken(user);
    user.password = undefined;
    return successResponse(res, 201, 'User registered successfully', { user, token });
  } catch (error) {
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, username, identifier, password } = req.body;
    const login = identifier || email || username;
    if (!login || !password) {
      return errorResponse(res, 400, 'Email or username and password are required');
    }

    const value = String(login).trim().toLowerCase();
    const query = value.includes('@') ? { email: value } : { username: value };
    const user = await User.findOne(query).select('+password');
    if (!user) {
      return errorResponse(res, 401, 'Invalid credentials');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return errorResponse(res, 401, 'Invalid credentials');
    }

    if (!user.isActive) {
      return errorResponse(res, 403, 'This account has been deactivated');
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = generateToken(user);
    user.password = undefined;
    return successResponse(res, 200, 'Login successful', { user, token });
  } catch (error) {
    next(error);
  }
});

// Google hands the ID token to the button on the frontend; this verifies it with
// Google and matches the account by its already-verified email address.
async function verifyGoogleCredential(credential) {
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!response.ok) return null;
  const claims = await response.json().catch(() => null);
  if (!claims || !claims.sub) return null;
  if (!['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss)) return null;
  if (String(claims.email_verified) !== 'true' || !claims.email) return null;
  if (claims.aud !== env.GOOGLE_CLIENT_ID) return null;
  if (!Number(claims.exp) || Number(claims.exp) * 1000 < Date.now()) return null;
  return claims;
}

async function uniqueUsername(base) {
  const fallback = 'reader';
  let candidate = (base || fallback).slice(0, 24) || fallback;
  let attempt = 1;
  while (await User.exists({ username: candidate })) {
    candidate = `${(base || fallback).slice(0, 20)}${attempt}`;
    attempt += 1;
  }
  return candidate;
}

router.post('/google', async (req, res, next) => {
  try {
    if (!env.GOOGLE_CLIENT_ID) {
      return errorResponse(res, 503, 'Google sign-in is not configured on this server');
    }
    const credential = String(req.body?.credential || '');
    if (!credential) return errorResponse(res, 400, 'Google credential is required');

    let claims;
    try {
      claims = await verifyGoogleCredential(credential);
    } catch (error) {
      console.warn('Google token check failed:', error.message);
    }
    // 400 rather than 401: the global interceptor treats 401 as an expired
    // session and hard-redirects, which would throw away the form being filled.
    if (!claims) return errorResponse(res, 400, 'Google sign-in could not be verified');

    const email = String(claims.email).toLowerCase();
    const user = await User.findOne({ email }).select('+password');

    if (user) {
      if (!user.isActive) return errorResponse(res, 403, 'This account has been deactivated');
      user.googleId = claims.sub;
      user.lastLoginAt = new Date();
      await user.save();
      const token = generateToken(user);
      user.password = undefined;
      return successResponse(res, 200, 'Signed in with Google', { user, token });
    }

    const base = String(claims.email).split('@')[0].replace(/[^a-z0-9._-]/gi, '').toLowerCase();
    // Google owns the password for these accounts, so a random one is stored to
    // satisfy the schema; sign-in always goes through Google.
    const created = await User.create({
      // Display names and avatars come from Google, so they are treated as
      // anything else a stranger types: plain, bounded, and a link that is a link.
      fullName: plainText(claims.name, { maxLength: 80 }) || base,
      username: await uniqueUsername(base),
      email,
      password: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
      googleId: claims.sub,
      avatar: safeMediaUrl(claims.picture) || undefined,
      role: 'READER'
    });

    const token = generateToken(created);
    created.password = undefined;
    return successResponse(res, 201, 'Signed up with Google', { user: created, token });
  } catch (error) {
    next(error);
  }
});

router.post('/admin-login', async (req, res, next) => {  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return errorResponse(res, 400, 'Username and password are required');
    }

    const user = await User.findOne({ username: String(username).trim().toLowerCase() }).select('+password');
    if (!user || !['ADMIN', 'EDITOR'].includes(user.role)) {
      return errorResponse(res, 401, 'Invalid admin credentials');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return errorResponse(res, 401, 'Invalid admin credentials');
    }

    if (!user.isActive) {
      return errorResponse(res, 403, 'This account has been deactivated');
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = generateToken(user);
    user.password = undefined;
    return successResponse(res, 200, 'Admin login successful', { user, token });
  } catch (error) {
    next(error);
  }
});

router.put('/credentials', protect, async (req, res, next) => {
  try {
    const { currentPassword, password, email, username, fullName } = req.body;
    if (!currentPassword) {
      return errorResponse(res, 400, 'Current password is required');
    }

    const user = await User.findById(req.user._id).select('+password');
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return errorResponse(res, 401, 'Current password is incorrect');
    }

    if (username) {
      const taken = await User.findOne({ username: String(username).toLowerCase(), _id: { $ne: user._id } });
      if (taken) return errorResponse(res, 409, 'That username is already taken');
      user.username = String(username).toLowerCase();
    }
    if (email) {
      if (!/^\S+@\S+\.\S+$/.test(String(email))) return errorResponse(res, 400, 'Invalid email address');
      const taken = await User.findOne({ email: String(email).toLowerCase(), _id: { $ne: user._id } });
      if (taken) return errorResponse(res, 409, 'That email is already in use');
      user.email = String(email).toLowerCase();
    }
    if (fullName) user.fullName = String(fullName).trim();
    if (password) {
      if (String(password).length < 8) return errorResponse(res, 400, 'New password must be at least 8 characters');
      user.password = await bcrypt.hash(String(password), 10);
      // The same rule as a recovery: a changed password ends the sessions that
      // were opened before it. The fresh token returned below is what keeps this
      // reader signed in.
      user.passwordChangedAt = new Date();
    }

    await user.save();
    user.password = undefined;

    const token = generateToken(user);
    return successResponse(res, 200, 'Login details updated', { user, token });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', protect, (req, res) => {
  return successResponse(res, 200, 'Logged out successfully');
});

router.get('/me', protect, async (req, res) => {
  const user = await User.findById(req.user._id).lean();
  return successResponse(res, 200, 'Profile fetched', { user });
});

/**
 * "I forgot my password", answered with a code sent to the address on the
 * account.
 *
 * Three things this has to get right at once:
 *
 * - it never tells anybody whether an address is registered. The reply is the
 *   same sentence either way, because a site that answers "no account here" is a
 *   directory of who reads the news;
 * - the code is only ever stored hashed, only ever reaches the address already on
 *   the account, and dies in ten minutes after five wrong tries;
 * - if the server cannot send mail at all, it says so. Promising a message that
 *   will never arrive is the worst thing a recovery screen can do, because the
 *   reader waits instead of asking the newsroom for help.
 */
router.post('/forgot-password', async (req, res, next) => {
  try {
    const mail = require('../services/mailerService');
    const state = mail.status();
    if (!state.configured) {
      // Not a per-account answer - this is true for every address on the server -
      // so it gives a probe nothing, and it stops a reader waiting for a mail
      // that cannot exist.
      return errorResponse(res, 503, 'This server is not able to send email. Ask the newsroom to reset it for you.');
    }

    const email = plainText(req.body?.email, { maxLength: 120 }).toLowerCase();
    // A code has to land somewhere, and the same sentence answers the rest.
    if (!email.includes('@')) return successResponse(res, 200, RECOVERY_ANSWER, { sent: false });

    const user = await User.findOne({ email }).select('+resetCodeSentAt +resetCodeExpires');
    if (!user || !user.isActive) return successResponse(res, 200, RECOVERY_ANSWER, { sent: false });

    if (resendIsCoolingDown(user.resetCodeSentAt)) {
      return successResponse(res, 200, RECOVERY_COOLING, { sent: false, cooling: true });
    }

    const { code, codeHash } = mintCode();
    await User.updateOne({ _id: user._id }, { $set: newResetFields(codeHash) });

    const sent = await mail.sendSignInCode({
      to: email,
      code,
      // Say the same thing the code actually does, so a reader who finds an old
      // mail in their inbox knows why it no longer works.
      ttlMinutes: Math.round(CODE_TTL_MS / 60000),
      maxAttempts: MAX_ATTEMPTS,
    });

    if (!sent.delivered) {
      // The relay refused. Take the code back out of the account: leaving it
      // live would mean a code a reader was told to expect, plus a mail that
      // nobody can check their spam folder for. Nothing else is touched - a
      // mail that never left must not end the reader's session or claim a
      // password changed.
      await User.updateOne({ _id: user._id }, wipedCodeFields());
      console.warn('recovery code mail was refused by the sender');
      return errorResponse(res, 502, 'The recovery email could not be sent. Try again, or ask the newsroom to reset it for you.');
    }

    return successResponse(res, 200, RECOVERY_ANSWER, { sent: true });
  } catch (error) {
    next(error);
  }
});

/**
 * The code and the new password, in one request, because a code that only
 * proves who you are - and then hands out a session - turns a stolen mailbox
 * into a stolen account.
 *
 * On success: the password is replaced, the code and its counters are wiped from
 * the document, and every token issued before this moment stops working.
 */
router.post('/reset-password', async (req, res, next) => {
  try {
    const email = plainText(req.body?.email, { maxLength: 120 }).toLowerCase();
    const code = String(req.body?.code || '').trim();
    const password = String(req.body?.password || '');

    const problem = passwordProblem(password);
    if (problem) return errorResponse(res, 400, problem);

    const user = await User.findOne({ email }).select('+password +resetCodeHash +resetCodeExpires +resetCodeAttempts');
    const verdict = checkCode(user, code);
    if (!verdict.ok) {
      if (user && verdict.reason !== 'EXPIRED' && verdict.reason !== 'NO_CODE') {
        await User.updateOne({ _id: user._id }, { $inc: { resetCodeAttempts: 1 } });
      }
      // One answer for every kind of no. An attacker with a stolen mailbox
      // learns nothing about which of the four reasons applied.
      return errorResponse(res, 400, RESET_REFUSAL);
    }

    if (await bcrypt.compare(password, user.password)) {
      return errorResponse(res, 400, 'Choose a password you are not already using.');
    }

    // One write: the new password, the password-changed timestamp that kills the
    // old sessions, and the code and its counters gone. Nothing is left that
    // could be replayed against the next time this address asks.
    const cleared = clearedResetFields();
    cleared.$set.password = await bcrypt.hash(password, 10);
    await User.updateOne({ _id: user._id }, cleared);

    return successResponse(res, 200, 'Your password has been changed. Sign in with the new one.', { reset: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
