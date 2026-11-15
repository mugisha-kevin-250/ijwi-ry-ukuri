const mongoose = require('mongoose');

/**
 * An advertisement the newsroom sold itself.
 *
 * Google's auction fills a space when it has a buyer for it. When it does not -
 * and on this site, with no AdSense ids supplied yet, that is every space - the
 * newsroom has been selling those spaces directly: a shop, a university, an
 * event. This document is that sale. It is written by whoever runs the desk
 * (typed, or drafted by Gemini from a brief an admin pasted) and it only reaches
 * a reader's screen once a person has published it.
 *
 * What is deliberately NOT here: an advertiser's claim that nobody checked. The
 * link is validated to be a plain public https address, the text is capped and
 * stripped of markup, and a creative that came from the model keeps
 * source: 'ai' so the desk can see which campaigns still need reading.
 */

const PLACEMENTS = ['nav', 'list', 'articleInline', 'articleSidebar', 'newsRail'];
const STATUSES = ['draft', 'live', 'paused'];

const adSchema = new mongoose.Schema({
  // Who is paying for the space. Printed as the small "by" line on the creative.
  advertiser: { type: String, required: true, trim: true, maxlength: 80 },
  headline: { type: String, required: true, trim: true, maxlength: 120 },
  body: { type: String, default: '', trim: true, maxlength: 320 },
  ctaLabel: { type: String, default: '', trim: true, maxlength: 30 },
  // Where the reader goes when they tap it. https only, no private host.
  link: { type: String, required: true, trim: true, maxlength: 500 },
  // Optional artwork. A /uploads path from this API or a public https image.
  image: { type: String, default: '', trim: true, maxlength: 500 },
  // Which spaces this campaign is sold into. 'any' means every space on the site.
  placements: { type: [String], default: ['nav'], enum: [...PLACEMENTS, 'any'] },
  // The colours the creative is printed in, so a campaign can look like the
  // advertiser instead of like us.
  theme: {
    bg: { type: String, default: '' },
    fg: { type: String, default: '' },
    accent: { type: String, default: '' },
  },
  status: { type: String, enum: STATUSES, default: 'draft' },
  // A campaign can be booked for a window. Both are optional; an expired creative
  // comes off the page by itself, which is what an advertiser paying for two
  // weeks needs to be able to trust.
  startsAt: { type: Date, default: null },
  endsAt: { type: Date, default: null },
  // When two live campaigns are sold into the same space, the higher priority
  // one is shown. Equal priority is decided by who was published first.
  priority: { type: Number, default: 0 },
  // How many readers actually tapped it. Counted from the click, never estimated.
  clicks: { type: Number, default: 0 },
  source: { type: String, enum: ['desk', 'ai'], default: 'desk' },
  model: { type: String, default: '' },
  // What the admin said the brief was, kept next to the words the model wrote
  // with it, so a published creative can be traced back to its instructions.
  brief: { type: String, default: '', trim: true, maxlength: 1200 },
  note: { type: String, default: '', trim: true, maxlength: 400 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  publishedAt: { type: Date, default: null },
}, { timestamps: true });

adSchema.index({ status: 1, priority: -1, publishedAt: -1 });

module.exports = mongoose.model('Ad', adSchema);
