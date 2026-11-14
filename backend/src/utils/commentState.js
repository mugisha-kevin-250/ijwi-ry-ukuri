const Comment = require('../models/Comment');
const Article = require('../models/Article');

/**
 * A comment a reader is allowed to see.
 *
 * A report is a request that a human look, not a verdict, so a reported comment
 * stays on the page until staff decide. Only "hidden" and "deleted" take it away,
 * and both of those are staff actions.
 */
const READER_STATUSES = ['active', 'reported'];

/**
 * `commentsCount` is a denormalised cache, so it is always recounted from the
 * comment rows themselves. Nudging it up on post and never down again is how a
 * thread ends up claiming eleven comments under an empty box.
 */
async function syncCommentCount(articleId) {
  const commentsCount = await Comment.countDocuments({
    article: articleId,
    status: { $in: READER_STATUSES },
  });
  await Article.updateOne({ _id: articleId }, { $set: { commentsCount } });
  return commentsCount;
}

/**
 * The only shape a comment leaves the server in. Who reported a comment is never
 * sent out, so a reader can only learn that they themselves pressed the button.
 */
function commentForReader(comment, viewerId) {
  const author = comment.user || {};
  return {
    _id: comment._id,
    content: comment.content,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    status: comment.status,
    reported: viewerId
      ? (comment.reportedBy || []).some((id) => String(id) === String(viewerId))
      : false,
    user: {
      _id: author._id,
      fullName: author.fullName,
      username: author.username,
    },
  };
}

module.exports = { READER_STATUSES, syncCommentCount, commentForReader };
