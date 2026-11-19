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
  // What the photograph shows, in the newsroom's own words. Kept apart from the
  // credit on purpose: one line says where the picture came from, the other says
  // what is in it, and a reader searching an image wants both.
  imageCaption: String,
  // The clip an author attached to the story. `videoUrl` is what they pasted or
  // uploaded, kept so the form can show and edit it; `videoEmbedUrl` is what the
  // reader's page is allowed to load and is rebuilt from the video id, never
  // taken from the request. `videoSource` says which player it needs - an iframe
  // for somebody else's platform, a plain <video> for a file.
  videoUrl: String,
  videoSource: { type: String, enum: ['', 'youtube', 'vimeo', 'file'], default: '' },
  videoEmbedUrl: String,
  // Everything the story carries after the one picture at the top and the one
  // clip under it: the second photograph, the wider shot, the statement played
  // after the first. The list is the author's, in the order they put it, and
  // each item states what it shows and whose it is - the disclosure that is
  // easiest to forget on picture two. `embedUrl` is written by the server from
  // what was pasted (see services/storyMedia.js), never taken from the form.
  media: [{
    kind: { type: String, enum: ['image', 'video'], default: 'image' },
    url: String,
    source: { type: String, enum: ['', 'youtube', 'vimeo', 'file'], default: '' },
    embedUrl: String,
    caption: String,
    credit: String
  }],
  // Paid content has to look like paid content. A story an advertiser paid for
  // carries who paid, and the reader sees it before the headline is finished.
  // Only an editor or an admin can set it - a writer declaring their own copy
  // sponsored, or an advertiser's copy declared as news, are both ways a
  // disclosure stops being a disclosure.
  isSponsored: { type: Boolean, default: false },
  sponsor: String,
  // Corrections are appended, never rewritten: the newsroom has to be able to
  // say what it got wrong and when it said so. Newest is last, and the story
  // shows them in order.
  corrections: [{
    _id: false,
    note: String,
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
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
  // What the story said before somebody rewrote it. Only the three fields a
  // reader acts on are kept, only for a story that has already left the
  // writer's own drafts, and only the newest handful - the question this
  // answers is "what did we publish at nine o'clock", not "reconstruct every
  // keystroke". Nothing here edits the live text: a revision is written from
  // the copy that is being replaced, in the same save.
  //
  // `select: false` is what keeps it internal. A revision is the previous
  // version of a story that is still on the site, and printing it next to the
  // live text would be the newsroom arguing with itself in public. The desk
  // asks for it by name in editorRoutes.
  revisions: {
    type: [{
      title: String,
      summary: String,
      content: String,
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      note: String,
      at: { type: Date, default: Date.now }
    }],
    select: false
  },
  // What the story is standing on. An author lists their own sources, in their
  // own words, and may withdraw one that is still the desk's to judge; whether
  // a source counts as verified is never the writer's call, which is why the
  // two fields below are staff-only - the status itself is shown to readers,
  // because "we checked" is a claim the page should make openly.
  sources: [{
    title: String,
    organization: String,
    url: String,
    // link | document | interview | official-data | observation
    type: { type: String, default: 'link' },
    quote: String,
    accessedAt: Date,
    verificationStatus: { type: String, default: 'pending' },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', select: false },
    reviewNote: { type: String, select: false },
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
