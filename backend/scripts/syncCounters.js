/**
 * Repairs the two denormalised counters that drift away from the rows they
 * summarise: `likes` (taps that arrived at the same time both incremented from
 * a stale read) and `readingTime` (estimated from characters until November 2026).
 *
 *   node scripts/syncCounters.js
 */
const mongoose = require('mongoose');
const env = require('../src/config/env');
const Article = require('../src/models/Article');
const Like = require('../src/models/Like');
const { estimateReadingTime } = require('../src/utils/readingTime');

async function main() {
  await mongoose.connect(env.MONGODB_URI);
  const articles = await Article.find({}).select('+content');
  let fixedLikes = 0;
  let fixedReadingTime = 0;

  for (const article of articles) {
    const likes = await Like.countDocuments({ article: article._id });
    const readingTime = estimateReadingTime(article.content);
    const patch = {};
    if (Number(article.likes || 0) !== likes) patch.likes = likes;
    if (Number(article.readingTime || 0) !== readingTime) patch.readingTime = readingTime;
    if (!Object.keys(patch).length) continue;
    await Article.updateOne({ _id: article._id }, { $set: patch });
    if (patch.likes !== undefined) fixedLikes += 1;
    if (patch.readingTime !== undefined) fixedReadingTime += 1;
    console.log(`${article.slug}: ${JSON.stringify(patch)}`);
  }

  console.log(`Checked ${articles.length} stories — likes resynced on ${fixedLikes}, reading time on ${fixedReadingTime}.`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
