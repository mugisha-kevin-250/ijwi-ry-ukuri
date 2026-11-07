const Notification = require('../models/Notification');
const User = require('../models/User');
const pushService = require('../utils/pushService');

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
async function announceArticlePublished(article) {
  const [inApp, push] = await Promise.all([
    announceInApp(article).catch((error) => {
      console.warn('inbox notification skipped:', error.message);
      return 0;
    }),
    pushService.notifyArticlePublished(article)
  ]);
  return { inApp, push };
}

module.exports = { announceArticlePublished, recipientIdsFor };
