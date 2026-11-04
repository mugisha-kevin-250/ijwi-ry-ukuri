const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  role: {
    type: String,
    enum: ['READER', 'WRITER', 'EDITOR', 'ADMIN'],
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
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

userSchema.index({ role: 1, isActive: 1 });

module.exports = mongoose.model('User', userSchema);
