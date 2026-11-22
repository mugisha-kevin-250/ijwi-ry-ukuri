const mongoose = require('mongoose');
const { permissionsFor } = require('../config/permissions');

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  // Google `sub` claim, set when the account signed in with Google at least once.
  googleId: { type: String, default: null, index: true },
  role: {
    type: String,
    // The four the site shipped with, then the staff desks carved out of the
    // same permission list (config/permissions.js). A role is only a name for a
    // set of permissions, so a new desk is a line in that file rather than a
    // change to every route; what is stored here is still just one string.
    enum: [
      'READER',
      'WRITER',
      'EDITOR',
      'ADMIN',
      'MANAGING_EDITOR',
      'NEWS_EDITOR',
      'SEO_EDITOR',
      'SOCIAL_MANAGER',
      'AD_MANAGER',
    ],
    default: 'READER'
  },
  isActive: { type: Boolean, default: true },
  avatar: String,
  country: String,
  language: String,
  bio: String,
  writerStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'suspended'],
    default: 'pending'
  },
  writerProfile: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WriterProfile'
  },
  lastLoginAt: Date,
  // Password recovery. Only the hash of the emailed code is stored, and it is
  // `select: false` so it cannot ride out of the database in a user payload by
  // accident. `passwordChangedAt` is what makes an old token useless: a session
  // issued before the password changed is a session somebody else had.
  resetCodeHash: { type: String, select: false },
  resetCodeExpires: { type: Date, select: false },
  resetCodeAttempts: { type: Number, default: 0, select: false },
  resetCodeSentAt: { type: Date, select: false },
  passwordChangedAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

userSchema.index({ role: 1, isActive: 1 });

// The permissions are never stored - they are read from the matrix whenever a
// role is asked about - so an account cannot carry a list of powers that has
// drifted away from its role, and changing what a desk means takes no migration.
// It rides along on the signed-in payload because the SPA hides the screens a
// role cannot use; the API still decides on its own for every request.
userSchema.virtual('permissions').get(function permissions() {
  return permissionsFor(this.role);
});

userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('User', userSchema);
