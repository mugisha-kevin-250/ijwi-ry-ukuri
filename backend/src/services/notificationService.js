const Notification = require('../models/Notification');
const User = require('../models/User');
const pushService = require('../utils/pushService');
const mailer = require('./mailerService');

function authorIdOf(article) {
  if (!article.author) return '';
  return String(article.author._id || article.author);
}

// The admin needs to know a story went out without watching the newsroom, and
// followers need it too — both get an inbox entry, everyone else only gets push.
async function recipientIdsFor(article) {
  const [admins, followerIds] = await Promise.all([
    User.find({ role: 'ADMIN', isActive: true }).select('_id').lean(),
    pushService.followersOf(article.author),
  ]);

  const ids = new Set([...admins.map((admin) => String(admin._id)), ...[...followerIds].map(String)]);
  ids.delete(authorIdOf(article));
  return [...ids];
}

async function announceInApp(article) {
  const ids = await recipientIdsFor(article);
  if (!ids.length) return 0;

  const message = `Inkuru nshya / New story: ${article.title}`;
  // Re-publishing the same story must not pile up duplicates in the inbox.
  await Notification.deleteMany({ relatedEntity: article._id, relatedModel: 'Article', type: 'new_story' });
  await Notification.insertMany(
    ids.map((user) => ({
      user,
      type: 'new_story',
      message,
      relatedEntity: article._id,
      relatedModel: 'Article'
    })),
    { ordered: false }
  );
  return ids.length;
}

// Publishing must never fail because the notification hop is slow or broken.
// The mail is the same announcement the app and the push channel already make,
// sent only to readers who confirmed an address, and it is allowed to say "no
// mail server here" without stopping the story from going live.
async function announceArticlePublished(article) {
  const [inApp, push, email] = await Promise.all([
    announceInApp(article).catch((error) => {
      console.warn('inbox notification skipped:', error.message);
      return 0;
    }),
    pushService.notifyArticlePublished(article),
    mailer.announceStory(article).catch((error) => {
      console.warn('email alert skipped:', error.message);
      return { delivered: false, sent: 0, failed: 0, error: 'SEND_FAILED' };
    }),
  ]);
  return { inApp, push, email };
}

// A decision about a draft belongs in the author's inbox, not just in the
// editor's. Without it a writer only learns their story was rejected by
// checking the list by hand.
async function notifyAuthorOfDecision(article, decision, note) {
  const authorId = String(article.author?._id || article.author || '');
  if (!authorId) return 0;

  const labels = {
    approved: 'Approved for publication',
    rejected: 'Sent back for changes',
  };
  const label = labels[decision] || decision;
  const detail = note ? ` — ${String(note).slice(0, 300)}` : '';
  const message = `“${article.title}” ${label}${detail}`;

  // The newest decision is the only one worth keeping per story and decision.
  await Notification.deleteMany({
    user: authorId,
    relatedEntity: article._id,
    relatedModel: 'Article',
    type: 'review_decision',
  });
  await Notification.create({
    user: authorId,
    type: 'review_decision',
    message,
    relatedEntity: article._id,
    relatedModel: 'Article',
  });
  return 1;
}

module.exports = { announceArticlePublished, recipientIdsFor, notifyAuthorOfDecision };
