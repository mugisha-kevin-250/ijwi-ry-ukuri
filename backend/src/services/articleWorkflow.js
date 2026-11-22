const Article = require('../models/Article');
const notificationService = require('./notificationService');
const lifecycle = require('../utils/articleLifecycle');
const { isStaffRole } = require('../config/permissions');

// Every state change in the product goes through here, so the rules in
// utils/articleLifecycle cannot be skipped by a route that forgot to check them.
// Returns { ok, article, error, status } instead of throwing: the callers all
// answer with a message a writer can read.
async function moveStory({ article, to, by, note = '' }) {
  if (!article) return { status: 404, error: 'There is no story with that address' };

  const from = article.status;
  const blocked = lifecycle.reason(from, to);
  if (blocked) return { status: 409, error: blocked };

  if (to === 'published') {
    const notReady = lifecycle.publishable(article);
    if (notReady) return { status: 422, error: `This story cannot go live yet: ${notReady}` };
  }

  // "first" decides whether readers get told. Republishing a story that was
  // taken down must not wake everyone who follows the author a second time.
  const firstPublish = to === 'published' && !article.publishedAt;

  article.status = to;
  article.reviewNote = note ? String(note).slice(0, 1000) : (to === 'approved' ? '' : article.reviewNote);
  article.reviewedAt = new Date();

  const event = { from, to, by: by ? by._id || by : null, at: new Date() };
  if (note) event.note = String(note).slice(0, 1000);
  if (!Array.isArray(article.reviewEvents)) article.reviewEvents = [];
  article.reviewEvents.push(event);
  if (article.reviewEvents.length > 50) {
    article.reviewEvents = article.reviewEvents.slice(-50);
  }

  if (to === 'approved' || to === 'rejected') article.approvedBy = event.by;

  if (to === 'published') {
    if (firstPublish) article.publishedAt = new Date();
  } else if (to === 'draft') {
    // Back in the author's hands: the old sign-off no longer means anything.
    article.approvedBy = undefined;
    article.publishedAt = undefined;
  }

  await article.save();

  // A reader-facing story that is now live has to reach its followers, and a
  // decision about someone's draft has to reach them too. Neither is allowed to
  // break the response, so a failure here only leaves a line in the server log.
  try {
    if (to === 'published' && firstPublish) {
      await notificationService.announceArticlePublished(article);
    } else if ((to === 'rejected' || to === 'approved') && by && String(by._id || by) !== String(article.author)) {
      await notificationService.notifyAuthorOfDecision(article, to, note);
    }
  } catch (error) {
    console.error('Story notification failed:', error?.message || error);
  }

  return { ok: true, article, firstPublish, from };
}

async function loadOwnStory(id, userId) {
  return Article.findOne({ _id: id, author: userId });
}

// The states a story may be destroyed in. Anything a reader or an editor can
// still see is taken down instead, because deleting it would remove the record
// without telling anyone who was looking at it.
const DELETABLE_STATES = ['draft', 'rejected', 'archived'];

// Once an editor has opened a story it belongs to their queue, so the author
// pulling it back would silently empty a desk someone is sitting at.
function reviewedBySomeoneElse(article, userId) {
  const me = String((userId && (userId._id || userId)) || '');
  return (article.reviewEvents || []).some((event) => String(event.by || '') !== me);
}

// What the author of this story is allowed to click, worked out from the same
// rules the routes enforce. The writer's shelf renders straight from this list,
// so a button that the server would refuse never appears on the page.
function authorActions(article, user) {
  if (!article) return [];
  const state = article.status;
  const role = String((user && user.role) || '').toUpperCase();
  const staff = isStaffRole(role);
  const ready = !lifecycle.publishable(article);
  const actions = [];

  // "Ready" is part of the offer, not just of the answer: a half-written story
  // has no send button, and the writer fixes that in the editor instead.
  if (ready && lifecycle.canMove(state, 'pending_review')) actions.push('submit');
  if (ready && (staff ? ['draft', 'approved', 'archived'].includes(state) : state === 'draft')) actions.push('publish');
  if (state === 'published' || (state === 'pending_review' && !reviewedBySomeoneElse(article, user))) actions.push('withdraw');
  if (DELETABLE_STATES.includes(state)) actions.push('delete');

  return actions;
}

module.exports = { moveStory, loadOwnStory, authorActions, reviewedBySomeoneElse, DELETABLE_STATES };
