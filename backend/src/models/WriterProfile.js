const mongoose = require('mongoose');

const writerProfileSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  fullName: { type: String, required: true },
  username: { type: String, required: true, unique: true, lowercase: true },
  bio: { type: String, default: '' },
  profileImage: String,
  country: String,
  language: String,
  reasonForWriting: String,
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'suspended'],
    default: 'pending'
  },
  totalArticles: { type: Number, default: 0 },
  totalValidViews: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

writerProfileSchema.index({ status: 1 });

module.exports = mongoose.model('WriterProfile', writerProfileSchema);
