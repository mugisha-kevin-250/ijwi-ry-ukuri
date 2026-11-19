// The edit history of a story, kept on the story.
//
// A newsroom that can rewrite a live page has to be able to say what was there
// before, otherwise "we corrected it" is unfalsifiable and a quiet change is
// indistinguishable from an honest one. This is deliberately not a general
// version-control system: it stores the three fields a reader acts on, it only
// remembers a story that had already left the author's drafts, and it keeps the
// newest few so a document cannot grow without bound.
const MAX_REVISIONS = 20;
const TEXT_FIELDS = ['title', 'summary', 'content'];

// Until a story has been seen by somebody else, editing it is not an editorial
// act. Keeping every keystroke-save of a draft would bury the edits that matter.
const RECORDED_STATES = ['pending_review', 'approved', 'published', 'rejected', 'archived'];

/**
 * The version that is about to be replaced, or null when nothing worth
 * remembering changed.
 *
 * Compare before assigning: once the document carries the new text, the old
 * text is gone from memory.
 */
function beforeEdit(article, changes) {
  if (!article || !RECORDED_STATES.includes(article.status)) return null;
  const changed = TEXT_FIELDS.some((field) => (
    changes[field] !== undefined && String(changes[field]) !== String(article[field] ?? '')
  ));
  if (!changed) return null;
  return TEXT_FIELDS.reduce((snapshot, field) => ({ ...snapshot, [field]: article[field] ?? '' }), {});
}

/**
 * Appends one snapshot atomically.
 *
 * `$push` with `$slice: -N` rather than reading the array and saving the
 * document, because `revisions` is `select: false` (it is the desk's copy of the
 * story, not the reader's) and because two people editing at once must not
 * silently drop one of the two records.
 */
async function append(Article, articleId, snapshot, by, note) {
  const revision = {
    ...snapshot,
    by,
    note: note || undefined,
    at: new Date(),
  };
  await Article.updateOne(
    { _id: articleId },
    { $push: { revisions: { $each: [revision], $slice: -MAX_REVISIONS } } },
  );
  return revision;
}

module.exports = { beforeEdit, append, MAX_REVISIONS, TEXT_FIELDS, RECORDED_STATES };
