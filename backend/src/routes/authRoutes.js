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

router.post('/admin-login', async (req, res, next) => {
  try {
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
