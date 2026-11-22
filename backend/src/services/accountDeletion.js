/**
 * Closing a reader's own account.
 *
 * The privacy page has promised since the first release that a reader can have
 * their account deleted. This is the door behind that promise: it removes the
 * person's record and every row that only ever existed because of them - what
 * they said, what they pressed, what they saved, which devices they woke, what
 * they asked the AI desk, the address on the mail list - so a closed account
 * really does leave nothing here to hand over.
 *
 * What it deliberately does NOT do is touch the newsroom's own record. A story
 * is somebody's work and the byline is how the paper says who did it; deleting
 * the writer's account would leave the story signed by nobody, which is editing
 * the newspaper after the fact. So an account that has stories, readers, or
 * money owed to it is refused here and sent to the desk instead, where a person
 * can decide what happens to the work. The refusal is the safe answer rather
 * than the polite one, and the reader is told exactly what is holding the door.
 */

const Article = require('../models/Article');
const AiResearchChat = require('../models/AiResearchChat');
const ArticleView = require('../models/ArticleView');
const Bookmark = require('../models/Bookmark');
const Comment = require('../models/Comment');
const ContactMessage = require('../models/ContactMessage');
const Follow = require('../models/Follow');
const Like = require('../models/Like');
const NewsletterSubscriber = require('../models/NewsletterSubscriber');
const Notification = require('../models/Notification');
const Payout = require('../models/Payout');
const PushSubscription = require('../models/PushSubscription');
const Report = require('../models/Report');
const User = require('../models/User');
const WriterEarning = require('../models/WriterEarning');
const WriterProfile = require('../models/WriterProfile');
const WriterWeeklyStat = require('../models/WriterWeeklyStat');
const { syncCommentCount } = require('../utils/commentState');

const deleted = (result) => (result && result.deletedCount) || 0;

/**
 * Why this account cannot be closed by the person holding the password.
 *
 * Each reason is a sentence the reader can act on, because the alternative -
 * a silent failure - leaves them believing the site kept their data anyway.
 */
async function blockersFor(user) {
  const [stories, earnings, payouts, profile] = await Promise.all([
    Article.countDocuments({ author: user._id }),
    WriterEarning.countDocuments({ writerId: user._id }),
    Payout.countDocuments({ writerId: user._id }),
    WriterProfile.findOne({ user: user._id }).select('_id'),
  ]);
  const followers = profile ? await Follow.countDocuments({ writer: profile._id }) : 0;

  const reasons = [];
  // Somebody the newsroom gave a desk to - staff, or an author whose application
  // was approved - is not closed by a form, whatever else they have or have not
  // published. A reader who only ever applied to write is their own person, and
  // gets to leave.
  const staff = ['EDITOR', 'ADMIN'].includes(user.role);
  const approvedWriter = user.role === 'WRITER' && user.writerStatus === 'approved';
  if (staff) {
    reasons.push('This account carries newsroom duties, so only the desk can close it.');
  } else if (approvedWriter) {
    reasons.push('This is an approved author account, and closing one is the desk\'s decision rather than a form.');
  }
  if (stories) {
    reasons.push(`This account has ${stories} ${stories === 1 ? 'story' : 'stories'} on the record, and a published byline is not erased with the person who wrote it.`);
  }
  if (followers) {
    reasons.push(`${followers} ${followers === 1 ? 'reader follows' : 'readers follow'} this author page.`);
  }
  if (earnings || payouts) {
    reasons.push('There is writer payment history on this account that the business has to keep.');
  }
  return reasons;
}

/**
 * The recount pass. `likes` and `commentsCount` are caches the newsroom reads
 * without going to the rows, so taking rows away without rewriting the cache is
 * how a story ends up showing nine likes that nobody gave.
 */
async function recount(articleIds) {
  for (const articleId of articleIds) {
    const likes = await Like.countDocuments({ article: articleId });
    await Article.updateOne({ _id: articleId }, { $set: { likes } });
    await syncCommentCount(articleId);
  }
}

/**
 * Everything the reader's own trace consists of, taken out in one pass.
 *
 * The order matters only at the end: the account row goes last, so a reader who
 * is refused halfway through still has an account they can act on rather than a
 * nameless pile of half-deleted rows.
 */
async function erase(user) {
  const id = user._id;
  const email = String(user.email || '').toLowerCase();
  const removed = {};

  const comments = await Comment.find({ user: id }).select('article').lean();
  const liked = await Like.find({ user: id }).select('article').lean();

  removed.comments = deleted(await Comment.deleteMany({ user: id }));
  removed.likes = deleted(await Like.deleteMany({ user: id }));
  removed.bookmarks = deleted(await Bookmark.deleteMany({ user: id }));

  const touched = new Set([
    ...comments.map((row) => String(row.article)),
    ...liked.map((row) => String(row.article)),
  ].filter((value) => value !== 'undefined'));
  await recount(touched);

  removed.follows = deleted(await Follow.deleteMany({ follower: id }));
  removed.notifications = deleted(await Notification.deleteMany({ user: id }));
  removed.devices = deleted(await PushSubscription.deleteMany({ user: id }));
  removed.aiChats = deleted(await AiResearchChat.deleteMany({ owner: id }));
  removed.reports = deleted(await Report.deleteMany({ reporter: id }));

  // Other readers' comment reports are kept; only the name of the person who
  // pressed the button is taken off them, because the report is a newsroom
  // moderation record and the account is not.
  await Comment.updateMany({ reportedBy: id }, { $pull: { reportedBy: id } });

  // The reading history is the reader's, but the view is the story's number. So
  // the row stays and the person is taken out of it: the newsroom keeps an
  // honest count that no longer points at anybody.
  const views = await ArticleView.updateMany({ readerId: id }, { $set: { readerId: null } });
  removed.readingHistory = (views && views.modifiedCount) || 0;

  // The mail list is keyed on the address rather than on the account, so both
  // ways of finding it are used: the link made while signed in, and the address
  // itself. A reader who subscribed with some other email is told that on the
  // account screen rather than left believing the sweep caught everything.
  removed.mailSubscriptions = deleted(await NewsletterSubscriber.deleteMany({
    $or: [{ user: id }, ...(email ? [{ email }] : [])],
  }));
  removed.contactMessages = deleted(await ContactMessage.deleteMany(email ? { email } : { _id: null }));

  // An author page nobody follows and that never published is this account's
  // own application, not the newsroom's record, so it goes with it.
  const profile = await WriterProfile.findOne({ user: id }).select('_id');
  if (profile) {
    removed.writerProfile = deleted(await WriterProfile.deleteMany({ user: id }));
    removed.orphanFollows = deleted(await Follow.deleteMany({ writer: profile._id }));
  }
  removed.earnings = deleted(await WriterWeeklyStat.deleteMany({ writerId: id }));

  removed.account = deleted(await User.deleteMany({ _id: id }));

  return { removed, touchedStories: touched.size };
}

/**
 * The one call the account screen makes. It refuses before it erases anything,
 * and it returns the reason in the same shape either way.
 */
async function closeAccount(user) {
  const reasons = await blockersFor(user);
  if (reasons.length) return { closed: false, reasons };
  const { removed, touchedStories } = await erase(user);
  return { closed: true, removed, touchedStories };
}

module.exports = { closeAccount, blockersFor, erase };
