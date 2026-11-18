/**
 * Rebuilds the `articles` text index so a story's language cannot break a save.
 *
 *   node scripts/fixArticleTextIndexLanguage.js
 *
 * Mongo treats a document field named `language` as the stemming language for
 * the text index, and rejects the write outright when the value is one it does
 * not know. The model now points that override at a field no article has
 * (`language_override: 'textIndexLanguage'`), but an index that already exists
 * keeps the options it was created with, and Mongo refuses a second index with
 * the same fields and different options rather than replacing it. So the old one
 * has to be dropped and recreated by hand, once, per database.
 *
 * What this touches is an index and nothing else: no story, user, category or
 * setting document is read or written. A text index is derived data - dropping
 * it costs search until the rebuild finishes, which the script does immediately
 * in the same connection, and it can be rebuilt again from the documents at any
 * time. A collection that already has the fixed index is reported and left
 * alone, so the script is safe to run twice.
 */
const mongoose = require('mongoose');
const env = require('../src/config/env');
const Article = require('../src/models/Article');

const FIELD = 'textIndexLanguage';

function isTextIndex(index) {
  return Object.values(index.key || {}).some((value) => value === 'text');
}

async function main() {
  await mongoose.connect(env.MONGODB_URI);
  const collection = Article.collection.collectionName;
  const before = await Article.collection.indexes();
  const text = before.filter(isTextIndex);

  console.log(`collection: ${collection}`);
  console.log(`text indexes found: ${text.length}`);

  if (!text.length) {
    console.log('No text index at all - creating it from the model.');
    await Article.syncIndexes();
    console.log('created:', JSON.stringify(await Article.collection.indexes().then((all) => all.filter(isTextIndex))));
    return;
  }

  const stale = text.filter((index) => index.language_override !== FIELD);
  const keep = text.filter((index) => index.language_override === FIELD);
  if (!stale.length) {
    console.log(`Nothing to do: every text index already uses language_override "${FIELD}".`);
    return;
  }

  for (const index of stale) {
    console.log(`dropping "${index.name}" (language_override: ${index.language_override})`);
    await Article.collection.dropIndex(index.name);
  }

  // syncIndexes reads the model, so the replacement is the index the next
  // deploy would have wanted anyway, with the weights Mongo assigned itself.
  await Article.syncIndexes();

  const after = await Article.collection.indexes();
  const rebuilt = after.filter(isTextIndex);
  console.log(`recreated: ${rebuilt.map((index) => index.name).join(', ') || 'NONE'}`);
  rebuilt.forEach((index) => {
    console.log(`  language_override: ${index.language_override}, default_language: ${index.default_language}`);
  });
  if (!rebuilt.length && !keep.length) {
    throw new Error('syncIndexes did not produce a text index; the model may not be loaded as expected');
  }
}

main()
  .then(() => mongoose.disconnect())
  .then(() => {
    console.log('done');
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('FAILED:', error.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
