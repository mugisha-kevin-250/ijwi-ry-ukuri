const Category = require('../models/Category');
const PlatformSetting = require('../models/PlatformSetting');
const { SECTIONS } = require('./categoryTree');
const { seedUsers } = require('./seedUsers');

/**
 * The section tree is written on every boot so a deploy that adds a section does
 * not need a migration. Only the structure is re-applied: a name or a
 * description an admin changed in the database is left alone, and no category is
 * ever removed, because stories are still pointing at the ones that exist.
 */
async function seedSections() {
  const upsert = (item, parent) =>
    Category.findOneAndUpdate(
      { slug: item.slug },
      {
        $set: {
          slug: item.slug,
          parent,
          order: item.order,
          aliases: [...new Set([item.slug, ...(item.aliases || [])])],
          labelKey: item.labelKey,
          isActive: true,
        },
        $setOnInsert: { name: item.name, description: item.description },
      },
      { upsert: true, new: true }
    );

  const ids = new Map();
  for (const section of SECTIONS) {
    const doc = await upsert(section, null);
    ids.set(section.slug, doc._id);
    for (const child of section.children) {
      const childDoc = await upsert(child, doc._id);
      ids.set(child.slug, childDoc._id);
    }
  }
  return ids;
}

async function seedDefaults() {
  const sectionIds = await seedSections();

  const settings = [
    { key: 'rewardRate', value: 5000 },
    { key: 'minimumPayout', value: 10000 },
    { key: 'duplicateViewInterval', value: 300000 },
    { key: 'minimumReadingDuration', value: 15 },
    { key: 'payoutSchedule', value: 'weekly' },
    { key: 'allowedArticleCategories', value: SECTIONS.map((section) => section.name) },
    { key: 'maxUploadSize', value: 5 * 1024 * 1024 }
  ];

  for (const item of settings) {
    await PlatformSetting.findOneAndUpdate(
      { key: item.key },
      { $set: { key: item.key, value: item.value, description: item.key } },
      { upsert: true, new: true }
    );
  }

  await seedUsers();
  return sectionIds;
}

module.exports = { seedDefaults, seedSections };
