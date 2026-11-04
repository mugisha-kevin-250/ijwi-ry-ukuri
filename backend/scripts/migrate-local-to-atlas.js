/**
 * Copies every collection from the currently configured local database into the
 * Atlas database given by ATLAS_URI. Only runs against an empty target unless --force.
 *
 *   node scripts/migrate-local-to-atlas.js "mongodb+srv://user:pass@host/ijwi?...targetDb"
 */
const mongoose = require('mongoose');
const env = require('../src/config/env');

const targetUri = process.argv[2];
const force = process.argv.includes('--force');
const targetDbName = process.argv[3];

if (!targetUri) {
  console.error('Usage: node scripts/migrate-local-to-atlas.js <ATLAS_URI> [databaseName] [--force]');
  process.exit(1);
}

async function main() {
  const dbName = targetDbName || 'ijwi';
  // Put the database name in the path segment: mongodb+srv://host/<db>?options
  const uriWithDb = targetUri.includes('?')
    ? targetUri.replace('/?', `/${dbName}?`)
    : `${targetUri.replace(/\/$/, '')}/${dbName}`;

  const source = await mongoose.createConnection(env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 }).asPromise();
  const target = await mongoose.createConnection(uriWithDb, { serverSelectionTimeoutMS: 30000 }).asPromise();

  const targetDb = target.db;
  console.log(`Source: ${source.name}  ->  Target: ${dbName}`);

  const collections = await source.db.listCollections().toArray();
  for (const item of collections) {
    const docs = await source.db.collection(item.name).find({}).toArray();
    if (!docs.length) continue;

    const existing = await targetDb.collection(item.name).countDocuments();
    if (existing > 0 && !force) {
      console.log(`SKIP ${item.name} (${existing} documents already in Atlas; use --force to append)`);
      continue;
    }
    await targetDb.collection(item.name).insertMany(docs, { ordered: false });
    console.log(`COPIED ${item.name}: ${docs.length}`);
  }

  await source.close();
  await target.close();
  console.log('Migration finished.');
}

main().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exit(1);
});
