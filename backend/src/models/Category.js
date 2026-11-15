const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true },
  description: String,
  // null for a top-level section. A sub-section points at its parent so the
  // header, the breadcrumb and the section page all read the same tree.
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  // Where the section sits in the header, and what the admin sees in a picker.
  order: { type: Number, default: 0 },
  // Other spellings this section is stored under, so an older story tagged
  // "Amasport" is still served by /sports. Aliases never replace a slug.
  aliases: { type: [String], default: [] },
  // The i18n key the site prints this section with, when one exists.
  labelKey: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  // Who last changed the section, so the desk list can say whose edit this is
  // rather than leaving an admin to guess.
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

categorySchema.index({ isActive: 1, slug: 1 });
categorySchema.index({ parent: 1, order: 1 });

module.exports = mongoose.model('Category', categorySchema);
