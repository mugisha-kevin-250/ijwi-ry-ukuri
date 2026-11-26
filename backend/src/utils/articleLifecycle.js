// One place decides what a story is allowed to become next, because the same
// story is touched by three kinds of account: the author saves and submits it,
// an editor or admin reviews and publishes it, and a scheduled job may publish
// it later. Without shared rules each route invented its own jump and a draft
// could reach "published" without anyone reading it.
//
// The states a reader can actually meet, and where each one may go:
//
//   draft          -> pending_review, published
//   pending_review -> approved, rejected, draft
//   approved       -> published, rejected
//   rejected       -> pending_review, draft
//   published      -> archived
//   archived       -> published
//
// "draft -> published" is the deliberate exception for a staff account, which
// writes and publishes its own story. "pending_review -> draft" is the other
// one, and it exists so a story can leave a queue it never should have joined:
// the author may pull it back while nobody has opened it, and an editor may hand
// it back to be rewritten. Which of those two a caller is allowed to do is
// decided at the route, so the table only says the move is not a jump.
//
// The rule that makes this trustworthy is
// applied at the route, not here: only WRITER, EDITOR and ADMIN hold a story at
// all, and only EDITOR and ADMIN may take a story out of review.

const LIFECYCLE = {
  draft: ['pending_review', 'published'],
  pending_review: ['approved', 'rejected', 'draft'],
  approved: ['published', 'rejected'],
  rejected: ['pending_review', 'draft'],
  published: ['archived'],
  archived: ['published'],
};

const STORY_STATES = Object.keys(LIFECYCLE);

function canMove(from, to) {
  return (LIFECYCLE[from] || []).includes(to);
}

function allowedMoves(from) {
  return [...(LIFECYCLE[from] || [])];
}

function reason(from, to) {
  if (!STORY_STATES.includes(to)) return `There is no "${to}" state for a story`;
  if (from === to) return `The story is already ${describe(to)}`;
  if (!canMove(from, to)) {
    return `A story that is ${describe(from)} cannot become ${describe(to)}`;
  }
  return '';
}

// The wording a writer reads back, not the raw enum value.
function describe(state) {
  switch (state) {
    case 'pending_review': return 'awaiting review';
    case 'approved': return 'approved for publication';
    case 'published': return 'live';
    case 'archived': return 'taken down';
    default: return state || 'missing';
  }
}

// A story cannot face a reader without these. Checked on every route that can
// land a story in "published", including the scheduled job.
function publishable(article) {
  if (!article) return 'There is no story to publish';
  if (!String(article.title || '').trim()) return 'The headline is empty';
  if (!String(article.summary || '').trim()) return 'The summary is empty';
  if (!String(article.content || '').trim()) return 'The story body is empty';
  if (!String(article.featuredImage || '').trim()) return 'A featured image is required before a story can be published';
  if (!article.category) return 'The story has no section';
  if (!article.author) return 'The story has no author';
  return '';
}

// The three money and review fields no route may accept from a request body.
// Keeping the list next to the rules is how an endpoint ends up forgetting one.
const RESTRICTED_FIELDS = ['status', 'publishedAt', 'views', 'validViews', 'uniqueViews', 'likes', 'commentsCount', 'approvedBy', 'reviewNote', 'aiGenerated'];

function firstRestrictedField(body) {
  return RESTRICTED_FIELDS.find((field) => body && body[field] !== undefined && !['status', 'publishedAt'].includes(field)) || null;
}

module.exports = {
  STORY_STATES,
  LIFECYCLE,
  canMove,
  allowedMoves,
  reason,
  describe,
  publishable,
  RESTRICTED_FIELDS,
  firstRestrictedField,
};
