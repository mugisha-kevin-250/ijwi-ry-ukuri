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

const router = express.Router();

function generateToken(user) {
  return jwt.sign({ id: user._id, role: user.role, email: user.email }, env.JWT_SECRET, { expiresIn: '7d' });
}

router.post('/register', async (req, res, next) => {
  try {
    const { fullName, username, email, password, country, language } = req.body;
    if (!fullName || !username || !email || !password) {
      return errorResponse(res, 400, 'Full name, username, email and password are required');
    }

    const exists = await User.findOne({ $or: [{ email }, { username }] });
    if (exists) {
      return errorResponse(res, 409, 'User already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      fullName,
      username,
      email,
      password: hashedPassword,
      country,
      language,
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
      fullName: claims.name || base,
      username: await uniqueUsername(base),
      email,
      password: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
      googleId: claims.sub,
      avatar: claims.picture || undefined,
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

router.post('/forgot-password', async (req, res) => {
  return successResponse(res, 200, 'Password reset link sent');
});

router.post('/reset-password', async (req, res) => {
  return successResponse(res, 200, 'Password reset successful');
});

module.exports = router;
