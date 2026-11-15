/**
 * The section desk.
 *
 * A section is the address a story is filed at, so the rules here are written
 * around one fact: renaming a section is safe, moving or deleting one is not.
 * Nothing in this file destroys a story's home without the admin naming where
 * the stories go first, and nothing is quietly removed from the header either -
 * a section that is hidden is hidden on purpose, and says so in the list.
 *
 * Two kinds of section exist and they behave differently:
 *   - the published tree (categoryTree.js), whose addresses are in the header,
 *     in the sitemap and possibly in a reader's bookmarks. Its slug is fixed.
 *   - anything the newsroom made afterwards, which is only reachable through
 *     /category/<slug> and whose slug is still only worth changing while no
 *     story is filed under it.
 */

const mongoose = require('mongoose');
const Category = require('../models/Category');
const Article = require('../models/Article');
const tree = require('../utils/categoryTree');
const generateSlug = require('../utils/generateSlug');
const { cleanText, plainText } = require('../utils/textFields');

const NAME_MAX = 60;
const DESCRIPTION_MAX = 500;

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function notFound(message) {
  const error = new Error(message);
  error.status = 404;
  return error;
}

/** Whether this stored spelling is one the published tree owns an address for. */
function isPublishedSection(category) {
  return Boolean(tree.findNode(category.slug));
}

/**
 * Every stored copy of the section a reader would recognise as the same thing:
 * the canonical slug, its aliases and the spellings the tree groups with it.
 * This is what makes "how many stories are in Sports" a real number rather than
 * the count of one of the three documents that call themselves Sports.
 */
async function storyCountFor(category) {
  const spellings = new Set([category.slug, ...(category.aliases || [])]);
  const node = tree.findNode(category.slug);
  if (node) tree.sectionSlugs(node).forEach((slug) => spellings.add(slug));

  const ids = await Category.find({ slug: { $in: [...spellings] } })
    .select('_id')
    .lean();
  const wanted = [...ids.map((item) => item._id), category._id];
  return Article.countDocuments({ category: { $in: wanted } });
}

/**
 * Normalise what the admin typed into something that can be stored.
 *
 * The name becomes the slug unless a slug was given, because a section address
 * made of spaces and capitals is an address nobody can read in a link.
 */
function shape(input, existing = null) {
  const name = plainText(input.name, { maxLength: NAME_MAX });
  if (!name) throw badRequest('A section needs a name');

  const asked = input.slug === undefined || input.slug === null || String(input.slug).trim() === ''
    ? ''
    : generateSlug(input.slug);
  let slug = asked || generateSlug(name);
  if (!slug) throw badRequest('That name does not make a usable web address');

  if (existing && existing.slug !== slug && isPublishedSection(existing)) {
    // The address is the published part; the name is not. Keeping them separate
    // is what lets /sports keep working while the desk calls it "Sport".
    slug = existing.slug;
  }

  const description = cleanText(input.description, { maxLength: DESCRIPTION_MAX });
  const order = Number.isFinite(Number(input.order)) ? Math.round(Number(input.order)) : (existing?.order ?? 0);
  const isActive = input.isActive === undefined ? (existing ? existing.isActive !== false : true) : Boolean(input.isActive);

  const aliases = Array.isArray(input.aliases)
    ? [...new Set(input.aliases.map((alias) => generateSlug(alias)).filter(Boolean))]
    : (existing?.aliases || []);

  return { name, slug, description, order, isActive, aliases, labelKey: plainText(input.labelKey ?? existing?.labelKey, { maxLength: 60 }) };
}

async function assertParent(parent, selfId) {
  if (!parent) return null;
  const id = String(parent);
  if (!mongoose.isValidObjectId(id)) throw badRequest('That parent section is not one we have');
  if (selfId && id === String(selfId)) throw badRequest('A section cannot sit inside itself');
  const found = await Category.findById(id).select('_id slug parent').lean();
  if (!found) throw badRequest('That parent section is not one we have');
  if (found.parent) throw badRequest('Sections go one level deep: pick a top-level section as the parent');
  if (selfId && String(found.parent) === String(selfId)) throw badRequest('A section cannot sit inside itself');
  return found._id;
}

async function assertSlugIsFree(slug, selfId) {
  const clash = await Category.findOne({ slug }).select('name').lean();
  if (clash && String(clash._id) !== String(selfId)) {
    throw badRequest(`There is already a section at /${slug}. Give this one a different name or address.`);
  }
}

async function list() {
  const categories = await Category.find({}).sort({ order: 1, name: 1 }).lean();
  const byId = new Map(categories.map((item) => [String(item._id), item]));

  const rows = await Promise.all(
    categories.map(async (category) => ({
      ...category,
      parentName: category.parent ? (byId.get(String(category.parent))?.name || '') : '',
      // The count that decides whether this section can be moved or removed, and
      // the one an admin needs before they rename something readers search for.
      storyCount: await storyCountFor(category),
      inSectionTree: isPublishedSection(category),
    })),
  );

  return rows;
}

async function create(input, actorId) {
  const shaped = shape(input);
  await assertParent(input.parent || null, null);
  await assertSlugIsFree(shaped.slug, null);

  const category = await Category.create({
    ...shaped,
    parent: input.parent || null,
    order: shaped.order || ((await Category.countDocuments()) + 1) * 10,
    updatedBy: actorId || undefined,
  });
  return category.toObject();
}

async function update(id, input, actorId) {
  if (!mongoose.isValidObjectId(id)) throw badRequest('That section is not one we have');
  const existing = await Category.findById(id);
  if (!existing) throw notFound('That section is not one we have');

  const shaped = shape({ ...existing.toObject(), ...input }, existing);
  await assertParent(input.parent === undefined ? existing.parent : input.parent || null, id);
  await assertSlugIsFree(shaped.slug, id);

  // The tree's addresses are public, so a section that the tree claims keeps its
  // own spelling even if the request carried another one.
  const keepAliases = input.aliases === undefined ? (existing.aliases || []) : shaped.aliases;
  const aliases = keepAliases.filter((alias) => alias !== shaped.slug);

  existing.name = shaped.name;
  existing.slug = shaped.slug;
  existing.description = shaped.description;
  existing.order = shaped.order;
  existing.isActive = shaped.isActive;
  existing.aliases = aliases;
  existing.labelKey = shaped.labelKey;
  existing.parent = input.parent === undefined ? existing.parent : (input.parent || null);
  if (actorId) existing.updatedBy = actorId;
  await existing.save();

  return existing.toObject();
}

/**
 * Take a section off the page, or off the site.
 *
 * Hidden is the normal answer: the section leaves the header, the writer's
 * picker and the section index, and every story filed under it keeps its home
 * and its address. Deleting is only allowed once the stories are somewhere else,
 * because a deleted category takes the reader's section link with it.
 */
async function remove(id, { moveTo } = {}) {
  if (!mongoose.isValidObjectId(id)) throw badRequest('That section is not one we have');
  const category = await Category.findById(id);
  if (!category) throw notFound('That section is not one we have');

  const inUse = await Article.countDocuments({ category: id });
  if (!moveTo) {
    if (inUse) {
      const error = new Error(
        `${inUse} stor${inUse === 1 ? 'y is' : 'ies are'} filed under “${category.name}”. Choose the section they move to, or hide this one instead of deleting it.`,
      );
      error.status = 409;
      throw error;
    }
    await category.deleteOne();
    return { deleted: true, moved: 0, name: category.name };
  }

  if (!mongoose.isValidObjectId(moveTo)) throw badRequest('The section you named is not one we have');
  if (String(moveTo) === String(id)) throw badRequest('A section cannot move its stories into itself');
  const target = await Category.findById(moveTo);
  if (!target) throw notFound('The section you named is not one we have');

  const moved = await Article.updateMany({ category: id }, { $set: { category: target._id } });
  await category.deleteOne();
  return { deleted: true, moved: moved?.modifiedCount ?? moved?.n ?? 0, name: category.name, into: target.name };
}

module.exports = { list, create, update, remove, storyCountFor, isPublishedSection };
