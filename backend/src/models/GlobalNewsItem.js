const mongoose = require('mongoose');

// A feed entry is a newsroom lead, never an automatically published RADAR article.
// Keep publisher attribution and the original link; editors must independently verify it.
const globalNewsItemSchema = new mongoose.Schema({
  dedupeKey: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 300 },
  description: { type: String, trim: true, maxlength: 4000, default: '' },
  imageUrl: { type: String, trim: true, maxlength: 1200, default: '' },
  imageCredit: { type: String, trim: true, maxlength: 160, default: '' },
  imageCaption: { type: String, trim: true, maxlength: 300, default: '' },
  imageSourceUrl: { type: String, trim: true, maxlength: 1200, default: '' },
  imageProvider: { type: String, trim: true, maxlength: 80, default: '' },
  sourceContent: { type: String, trim: true, maxlength: 30000, default: '' },
  extractionStatus: { type: String, enum: ['pending', 'extracted', 'limited', 'restricted', 'unavailable'], default: 'pending' },
  extractionNote: { type: String, trim: true, maxlength: 500, default: '' },
  sourceAuthor: { type: String, trim: true, maxlength: 200, default: '' },
  sourcePublishedAt: { type: String, trim: true, maxlength: 100, default: '' },
  sourceImages: [{ url: { type: String, maxlength: 1200 }, caption: { type: String, maxlength: 300 }, credit: { type: String, maxlength: 160 } }],
  sourceExtractedAt: Date,
  sourceWordCount: { type: Number, default: 0 },
  englishTitle: { type: String, trim: true, maxlength: 300, default: '' },
  englishDescription: { type: String, trim: true, maxlength: 4000, default: '' },
  translatedAt: Date,
  draftArticle: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', default: null },
  link: { type: String, required: true, trim: true, maxlength: 1200 },
  sourceName: { type: String, required: true, trim: true, maxlength: 120 },
  sourceUrl: { type: String, required: true, trim: true, maxlength: 1200 },
  region: { type: String, default: 'WORLD', uppercase: true, trim: true, maxlength: 12 },
  language: { type: String, default: 'en', lowercase: true, trim: true, maxlength: 12 },
  publishedAt: Date,
  fetchedAt: { type: Date, default: Date.now },
  reviewStatus: { type: String, enum: ['unreviewed', 'reviewing', 'verified', 'rejected'], default: 'unreviewed', index: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: Date,
  editorNote: { type: String, maxlength: 2000, default: '' },
  draftCreatedAt: Date,
}, { timestamps: true });
globalNewsItemSchema.index({ region: 1, publishedAt: -1 });
globalNewsItemSchema.index({ reviewStatus: 1, fetchedAt: -1 });
globalNewsItemSchema.index({ title: 'text', sourceName: 'text' });
module.exports = mongoose.model('GlobalNewsItem', globalNewsItemSchema);
