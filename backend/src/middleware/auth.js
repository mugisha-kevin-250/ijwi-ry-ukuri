const jwt = require('jsonwebtoken');
const User = require('../models/User');
const env = require('../config/env');

async function protect(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: [env.JWT_ALGORITHM] });
    const user = await User.findById(decoded.id).select('+password');

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Invalid or inactive user' });
    }

    // Changing a password also ends every session that was opened before it.
    // Without this, a code that reached whoever holds the mailbox would hand
    // over an account while the old token kept working for a week.
    //
    // New tokens carry the password change in milliseconds (`pwdAt`), so the
    // test is exact: the number the session was born with has to still be the
    // number on the account. Tokens minted before that claim existed - up to a
    // week old, from the previous release - fall back to comparing against the
    // token's `iat`, which only counts whole seconds. That is why a reader who
    // resets their password and signs in again in the same second is never
    // turned away by it: the second login mints a token with the new number on
    // it, and the exact rule takes over.
    if (decoded.pwdAt !== undefined) {
      const changedAt = user.passwordChangedAt ? user.passwordChangedAt.getTime() : 0;
      if (Number(decoded.pwdAt) !== changedAt) {
        return res.status(401).json({ success: false, message: 'This account changed its password since you signed in. Please sign in again.' });
      }
    } else if (user.passwordChangedAt && decoded.iat && user.passwordChangedAt.getTime() > decoded.iat * 1000) {
      return res.status(401).json({ success: false, message: 'This account changed its password since you signed in. Please sign in again.' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    next();
  };
}

async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return next();
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: [env.JWT_ALGORITHM] });
    const user = await User.findById(decoded.id);
    if (user && user.isActive) req.user = user;
    next();
  } catch (error) {
    next();
  }
}

module.exports = { protect, authorize, optionalAuth };
