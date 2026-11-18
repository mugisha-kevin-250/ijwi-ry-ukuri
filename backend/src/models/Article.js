const mongoose = require('mongoose');
const { estimateReadingTime } = require('../utils/readingTime');

const articleSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  summary: { type: String, required: true, trim: true },
  // What a search engine prints under the link. Optional: a story written
  // without one falls back to its summary.
  metaDescription: { type: String, trim: true },
  content: { type: String, required: true },
  featuredImage: String,
  // Who took the picture on the story and where it came from. A photograph the
  // newsroom did not make has to say so, and an AI story usually borrows the
  // source's own image, so these travel with it.
  imageCredit: String,
  imageSourceUrl: String,
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
  // Readers have to be able to see which stories a machine wrote, and only the
  // admin portal can produce them.
  aiGenerated: { type: Boolean, default: false },
  country: String,
  // The review trail an editor leaves behind. approvedBy and reviewNote answer
  // "who signed this off and what did they say", and reviewEvents is the full
  // history, so a story can be explained after the fact instead of guessed at.
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  reviewNote: String,
  reviewEvents: [{
    _id: false,
    from: String,
    to: String,
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note: String,
    at: { type: Date, default: Date.now }
  }],
  scheduledAt: Date,
  publishedAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

articleSchema.index({ status: 1, publishedAt: -1 });
// The options matter as much as the fields. Mongo reads a document's `language`
// as the stemming language for its text index and refuses the write when the
// value is one it does not know - "language override unsupported: rw" was the
// whole story of a Kinyarwanda article that saved fine everywhere else. Pointing
// the override at a field no article has takes that trap out of the write path
// while keeping English stemming, which is what every stored story uses. The
// story's own `language` stays exactly what the newsroom typed: it is metadata
// for readers and filters, and the machine translations live in their own
// collection. An existing database has to rebuild this index once - see
// scripts/fixArticleTextIndexLanguage.js.
articleSchema.index(
  { title: 'text', summary: 'text', content: 'text', tags: 'text' },
  { default_language: 'english', language_override: 'textIndexLanguage' }
);
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
