const mongoose = require('mongoose');

/**
 * One translated thing.
 *
 * A reader choosing a language should not have to pay for that language twice,
 * and neither should the newsroom: the first request for a story in Luganda
 * asks Google, and every request after it is answered from here. `sourceHash`
 * is what makes that safe - when the English original is edited, the hash
 * changes and the old translation is no longer served, so a correction never
 * reaches a reader as a stale sentence in another language.
 */
const translationSchema = new mongoose.Schema(
  {
    // 'story' is one published article; 'chrome' is the site's own buttons and
    // labels, which are translated as one set because they always change together.
    kind: { type: String, enum: ['story', 'chrome'], required: true },
    lang: { type: String, required: true, lowercase: true },
    // Story id for kind 'story'; one fixed name for the chrome set.
    key: { type: String, required: true },
    sourceHash: { type: String, required: true },
    // Which field each part carries, so a story's title, summary and body can be
    // handed back apart without guessing.
    parts: [
      {
        field: { type: String, default: '' },
        source: { type: String, default: '' },
        text: { type: String, default: '' },
      },
    ],
    chars: { type: Number, default: 0 },
    // The story a translation belongs to, when there is one, so it can be
    // dropped together with the story.
    article: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', default: null },
  },
  { timestamps: true },
);

translationSchema.index({ kind: 1, lang: 1, key: 1 }, { unique: true });
translationSchema.index({ article: 1 }, { sparse: true });

module.exports = mongoose.model('Translation', translationSchema);
