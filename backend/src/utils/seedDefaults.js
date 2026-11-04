const Category = require('../models/Category');
const PlatformSetting = require('../models/PlatformSetting');
const { seedUsers } = require('./seedUsers');

const defaultCategories = [
  'Rwanda', 'Politik', 'Ubucuruzi', 'Imirire', 'Teknolojia', 'Amasport', 'Ibisindi', 'Ubuzima', 'Ibindi'
];

async function seedDefaults() {
  for (const name of defaultCategories) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await Category.findOneAndUpdate(
      { slug },
      { $set: { name, slug, description: `${name} news and updates`, isActive: true } },
      { upsert: true, new: true }
    );
  }

  const settings = [
    { key: 'rewardRate', value: 5000 },
    { key: 'minimumPayout', value: 10000 },
    { key: 'duplicateViewInterval', value: 300000 },
    { key: 'minimumReadingDuration', value: 15 },
    { key: 'payoutSchedule', value: 'weekly' },
    { key: 'allowedArticleCategories', value: defaultCategories },
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
}

module.exports = { seedDefaults };
