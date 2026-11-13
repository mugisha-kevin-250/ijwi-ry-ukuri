const mongoose = require('mongoose');
const Category = require('../models/Category');
const tree = require('./categoryTree');

/**
 * The same section is stored twice, once in English and once in Kinyarwanda
 * (sports/amasport, technology/tehnologija, ...), because writers and admins each
 * created their own copy. Nothing is deleted: every spelling is listed under one
 * canonical slug so a section page and a section filter can show both copies.
 *
 * These are the spellings that existed before the section tree was drawn, and
 * they stay here so a section nobody has re-seeded still resolves. Anything the
 * tree already claims is resolved from the tree instead.
 */
const GROUPS = [
  { slug: 'rwanda', aliases: ['rwanda'] },
  { slug: 'africa', aliases: ['africa'] },
  { slug: 'world', aliases: ['world'] },
  { slug: 'politik', aliases: ['politik', 'politics', 'politiki'] },
  { slug: 'business', aliases: ['business', 'ubucuruzi', 'economy'] },
  { slug: 'technology', aliases: ['technology', 'tehnologija', 'teknolojia', 'teknolojiya', 'tekonolojiya', 'ikoranabuhanga'] },
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
  ALIAS_TO_GROUP.set(tree.normalize(group.slug), group);
  group.aliases.forEach((alias) => ALIAS_TO_GROUP.set(tree.normalize(alias), group));
});

/**
 * Every spelling that names this section. Asking for a section also asks for
 * everything under it, so a story filed under Football is served by /sports.
 */
function slugsInSection(slugOrName) {
  const asked = String(slugOrName || '');
  const node = tree.findNode(asked);
  const spellings = node ? tree.sectionSlugs(node) : [];
  const legacy = ALIAS_TO_GROUP.get(tree.normalize(asked));
  if (legacy) spellings.push(legacy.slug, ...legacy.aliases);
  spellings.push(asked);
  return [...new Set(spellings)];
}

/**
 * Resolves a category given as a slug, a name or an id into every stored copy of
 * that section, so a story tagged "Amasport" is also served on /sports.
 */
async function categoryIdsFor(value) {
  if (!value) return [];
  const asked = String(value);
  if (mongoose.isValidObjectId(asked)) return [asked];

  const siblings = await Category.find({ slug: { $in: slugsInSection(asked) } })
    .select('_id slug')
    .lean();
  if (siblings.length) return siblings.map((item) => item._id);

  // A section created after these tables were written still resolves by its own slug.
  const exact = await Category.findOne({ slug: asked.toLowerCase() }).select('_id').lean();
  return exact ? [exact._id] : [];
}

/** The stored copy a section address stands for; the canonical one wins. */
async function sectionDocFor(slug) {
  const node = tree.findNode(slug);
  const canonical = node ? (node.child || node.section).slug : String(slug || '').toLowerCase();
  const ids = await categoryIdsFor(slug);
  if (!ids.length) return null;
  const docs = await Category.find({ _id: { $in: ids }, isActive: true }).sort({ order: 1, slug: 1 }).lean();
  return docs.find((doc) => doc.slug === canonical) || docs[0] || null;
}

/**
 * The header and the section pages read this. The shape comes from the section
 * table, the names and descriptions from the database, so an admin who renames a
 * section sees the new name without the addresses moving.
 */
async function sectionTree() {
  const docs = await Category.find({ isActive: true })
    .select('name slug description labelKey order aliases')
    .lean();
  const bySpelling = new Map();
  docs.forEach((doc) => {
    bySpelling.set(doc.slug, doc);
    (doc.aliases || []).forEach((alias) => {
      if (!bySpelling.has(alias)) bySpelling.set(alias, doc);
    });
  });

  const node = (item, section) => {
    const stored = bySpelling.get(item.slug) || bySpelling.get(tree.normalize(item.slug));
    return {
      _id: stored ? String(stored._id) : null,
      slug: item.slug,
      name: stored?.name || item.name,
      labelKey: stored?.labelKey || item.labelKey,
      description: stored?.description || item.description,
      aliases: item.aliases || [],
      href: section ? `/${section.slug}/${item.slug}` : `/${item.slug}`,
      children: (item.children || []).map((child) => node(child, item)),
    };
  };

  return tree.SECTIONS.map((section) => node(section, null));
}

/**
 * Where a stored slug should be linked from, so the two copies of a section and
 * every sub-section share one address. Returns null for a category that is not
 * part of the section tree: those keep their /category/<slug> page.
 */
function sectionPathFor(slugOrName) {
  const node = tree.findNode(slugOrName);
  if (!node) return null;
  return node.child ? `/${node.section.slug}/${node.child.slug}` : `/${node.section.slug}`;
}

module.exports = { GROUPS, SECTIONS: tree.SECTIONS, slugsInSection, categoryIdsFor, sectionDocFor, sectionTree, sectionPathFor };
