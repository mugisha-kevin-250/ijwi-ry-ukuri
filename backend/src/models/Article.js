const mongoose = require('mongoose');
const { estimateReadingTime } = require('../utils/readingTime');

const articleSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  summary: { type: String, required: true, trim: true },
  content: { type: String, required: true },
  featuredImage: String,
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  tags: [{ type: String, trim: true }],
  status: {
    type: String,
    enum: ['draft', 'pending_review', 'approved', 'rejected', 'published', 'archived'],
    default: 'draft'
  },
  views: { type: Number, default: 0 },
  validViews: { type: Number, default: 0 },
  uniqueViews: { type: Number, default: 0 },
  likes: { type: Number, default: 0 },
  commentsCount: { type: Number, default: 0 },
  readingTime: { type: Number, default: 1 },
  language: { type: String, default: 'en' },
  country: String,
  publishedAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

articleSchema.index({ status: 1, publishedAt: -1 });
articleSchema.index({ title: 'text', summary: 'text', content: 'text', tags: 'text' });
articleSchema.index({ author: 1, createdAt: -1 });
articleSchema.index({ validViews: -1 });

// Every write path saves through the document, so deriving the estimate here
// keeps it truthful when a writer edits the story instead of only at creation.
articleSchema.pre('save', function setReadingTime() {
  if (this.isModified('content') || !this.readingTime) {
    this.readingTime = estimateReadingTime(this.content);
  }
});

module.exports = mongoose.model('Article', articleSchema);
