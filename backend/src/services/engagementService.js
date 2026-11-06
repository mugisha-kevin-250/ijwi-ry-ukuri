const Bookmark = require('../models/Bookmark');
const Follow = require('../models/Follow');
const Like = require('../models/Like');
const WriterProfile = require('../models/WriterProfile');

function authorIdOf(article) {
  const author = article.author;
  if (!author) return '';
  return String(author._id ? author._id : author);
}

// One batched lookup for the whole page: which of these articles has the signed-in
// reader liked / saved, and which authors does the reader follow.
async function engagementFor(user, articles) {
  const empty = () => ({ liked: new Set(), bookmarked: new Set(), followingAuthors: new Map() });
  if (!user || articles.length === 0) return empty();

  const articleIds = articles.map((article) => article._id);
  const authorIds = [...new Set(articles.map(authorIdOf).filter(Boolean))];

  const [likes, bookmarks, profiles] = await Promise.all([
    Like.find({ user: user._id, article: { $in: articleIds } }).select('article'),
    Bookmark.find({ user: user._id, article: { $in: articleIds } }).select('article'),
    authorIds.length ? WriterProfile.find({ user: { $in: authorIds } }).select('_id user') : []
  ]);

  const writerIds = profiles.map((profile) => profile._id);
  const follows = writerIds.length
    ? await Follow.find({ follower: user._id, writer: { $in: writerIds } }).select('writer')
    : [];

  const writerIdByUser = new Map(profiles.map((profile) => [String(profile.user), String(profile._id)]));
  const followedWriters = new Set(follows.map((follow) => String(follow.writer)));

  const followingAuthors = new Map();
  for (const article of articles) {
    const authorId = authorIdOf(article);
    if (!authorId || authorId === String(user._id)) continue;
    const writerId = writerIdByUser.get(authorId);
    followingAuthors.set(authorId, Boolean(writerId) && followedWriters.has(writerId));
  }

  return {
    liked: new Set(likes.map((like) => String(like.article))),
    bookmarked: new Set(bookmarks.map((bookmark) => String(bookmark.article))),
    followingAuthors
  };
}

// Returns plain objects so the reader's own state travels with each article.
async function withEngagement(user, articles) {
  const docs = articles.map((article) => article.toObject());
  if (!user) return docs;
  const engagement = await engagementFor(user, articles);
  return docs.map((doc, index) => ({
    ...doc,
    liked: engagement.liked.has(String(doc._id)),
    bookmarked: engagement.bookmarked.has(String(doc._id)),
    followingAuthor: engagement.followingAuthors.get(authorIdOf(articles[index])) || false
  }));
}

module.exports = { engagementFor, withEngagement };
