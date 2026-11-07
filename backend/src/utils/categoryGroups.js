const mongoose = require('mongoose');
const Category = require('../models/Category');

/**
 * The same section is stored twice, once in English and once in Kinyarwanda
 * (sports/amasport, technology/teknolojia, ...), because writers and admins each
 * created their own copy. Nothing is deleted: every spelling is listed under one
 * canonical slug so a section page and a section filter can show both copies.
 */
const GROUPS = [
  { slug: 'rwanda', aliases: ['rwanda'] },
  { slug: 'africa', aliases: ['africa'] },
  { slug: 'world', aliases: ['world'] },
  { slug: 'politik', aliases: ['politik', 'politics', 'politiki'] },
  { slug: 'business', aliases: ['business', 'ubucuruzi', 'economy'] },
  { slug: 'technology', aliases: ['technology', 'teknolojia', 'teknolojiya', 'tekonolojiya', 'ikoranabuhanga'] },
  { slug: 'sports', aliases: ['sports', 'sport', 'amasport', 'amasports', 'imikino'] },
  { slug: 'entertainment', aliases: ['entertainment', 'ibisindi', 'amuseke'] },
  { slug: 'health', aliases: ['health', 'ubuzima', 'imirire'] },
  { slug: 'education', aliases: ['education', 'amahuguro'] },
  { slug: 'campus', aliases: ['campus'] },
  { slug: 'jobs', aliases: ['jobs'] },
  { slug: 'opportunities', aliases: ['opportunities'] },
  { slug: 'lifestyle', aliases: ['lifestyle'] },
  { slug: 'opinions', aliases: ['opinions'] },
  { slug: 'ibindi', aliases: ['ibindi', 'other'] },
];

const ALIAS_TO_GROUP = new Map();
GROUPS.forEach((group) => {
  ALIAS_TO_GROUP.set(normalize(group.slug), group);
  group.aliases.forEach((alias) => ALIAS_TO_GROUP.set(normalize(alias), group));
});

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

/** Every spelling this section is stored under, including the one asked for. */
function slugsInSection(slugOrName) {
  const asked = String(slugOrName || '');
  const group = ALIAS_TO_GROUP.get(normalize(asked));
  if (!group) return [asked];
  return [...new Set([group.slug, ...group.aliases, asked])];
}

/**
 * Resolves a category given as a slug, a name or an id into every stored copy of
 * that section, so a story tagged "Amasport" is also served on /category/sports.
 */
async function categoryIdsFor(value) {
  if (!value) return [];
  const asked = String(value);
  if (mongoose.isValidObjectId(asked)) return [asked];

  const siblings = await Category.find({ slug: { $in: slugsInSection(asked) } })
    .select('_id slug')
    .lean();
  if (siblings.length) return siblings.map((item) => item._id);

  // A section created after this table was written still resolves by its own slug.
  const exact = await Category.findOne({ slug: asked.toLowerCase() }).select('_id').lean();
  return exact ? [exact._id] : [];
}

module.exports = { GROUPS, slugsInSection, categoryIdsFor };
