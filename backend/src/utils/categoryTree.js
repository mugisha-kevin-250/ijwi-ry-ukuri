/**
 * The sections the newsroom publishes and what sits under each one. This one
 * list seeds the database, answers every /section and /section/sub page and
 * builds the header, so the address a reader sees, the picker a writer uses
 * and the admin's AI panel cannot grow into three different structures.
 *
 * `aliases` are the other spellings the same section is already stored under:
 * the English and Kinyarwanda copies writers created side by side, and the
 * slugs used before this structure existed. Nothing is renamed or deleted - a
 * story tagged under any alias is served by the section it belongs to, and the
 * old address keeps working through a redirect.
 *
 * `labelKey` is the i18n key the site prints the section with, so a section
 * stored as "Amasport" is offered as Sports, Imikino or Michezo.
 */
const SECTIONS = [
  {
    slug: 'trending',
    name: 'Trending',
    labelKey: 'category.trending',
    description: 'What readers are moving to right now, measured by the stories they actually open.',
    aliases: ['trending'],
    children: [],
  },
  {
    slug: 'rwanda',
    name: 'Rwanda',
    labelKey: 'category.rwanda',
    description: 'Reporting from every district in Rwanda: decisions, places and the people they touch.',
    aliases: ['rwanda'],
    children: [],
  },
  {
    slug: 'world',
    name: 'World',
    labelKey: 'category.world',
    description: 'Stories from outside Rwanda that change something for a reader here.',
    aliases: ['world', 'international', 'isi'],
    children: [
      { slug: 'middle-east', name: 'Middle East', labelKey: 'category.middleEast', description: 'News from the Middle East.', aliases: ['middle-east', 'middleeast'] },
      { slug: 'africa', name: 'Africa', labelKey: 'category.africa', description: 'News from across Africa.', aliases: ['africa'] },
      { slug: 'americas', name: 'Americas', labelKey: 'category.americas', description: 'News from North and South America.', aliases: ['americas', 'america'] },
      { slug: 'europe', name: 'Europe', labelKey: 'category.europe', description: 'News from Europe.', aliases: ['europe'] },
      { slug: 'asia-pacific', name: 'Asia-Pacific', labelKey: 'category.asiaPacific', description: 'News from Asia and the Pacific.', aliases: ['asia-pacific', 'asiapacific', 'asia'] },
    ],
  },
  {
    slug: 'politics',
    name: 'Politics',
    labelKey: 'category.politics',
    description: 'Government, parties, parliaments and the deals behind the decisions.',
    aliases: ['politics', 'politik', 'politiki'],
    children: [
      { slug: 'elections', name: 'Elections', labelKey: 'category.elections', description: 'Votes, candidates and results.', aliases: ['elections', 'amatora'] },
      { slug: 'diplomacy', name: 'Diplomacy', labelKey: 'category.diplomacy', description: 'Relations between governments.', aliases: ['diplomacy', 'diplomatic'] },
      { slug: 'global-leaders', name: 'Global Leaders', labelKey: 'category.globalLeaders', description: 'The people running governments and what they say next.', aliases: ['global-leaders', 'leaders', 'heads-of-state'] },
    ],
  },
  {
    slug: 'business',
    name: 'Business',
    labelKey: 'category.business',
    description: 'Companies, money, trade and work.',
    aliases: ['business', 'ubucuruzi', 'companies'],
    children: [
      { slug: 'markets', name: 'Markets', labelKey: 'category.markets', description: 'Prices, exchanges and what moved them.', aliases: ['markets'] },
      { slug: 'economy', name: 'Economy', labelKey: 'category.economy', description: 'Growth, budgets, jobs and inflation.', aliases: ['economy'] },
      { slug: 'crypto', name: 'Crypto', labelKey: 'category.crypto', description: 'Digital money and the businesses built on it.', aliases: ['crypto', 'cryptocurrency'] },
      { slug: 'energy', name: 'Energy', labelKey: 'category.energy', description: 'Power, fuel and the grid.', aliases: ['energy', 'power'] },
      { slug: 'personal-finance', name: 'Personal Finance', labelKey: 'category.personalFinance', description: 'Saving, borrowing, insurance and tax for one household.', aliases: ['personal-finance', 'finance', 'money'] },
    ],
  },
  {
    slug: 'tech',
    name: 'Tech',
    labelKey: 'category.tech',
    description: 'Technology, the internet and the machines around us.',
    aliases: ['tech', 'technology', 'tehnologija', 'teknolojia', 'teknolojiya', 'tekonolojiya', 'ikoranabuhanga'],
    children: [
      { slug: 'ai', name: 'AI', labelKey: 'category.ai', description: 'Machines that write, decide and see.', aliases: ['ai', 'artificial-intelligence'] },
      { slug: 'gadgets', name: 'Gadgets', labelKey: 'category.gadgets', description: 'Phones, laptops and hardware.', aliases: ['gadgets', 'hardware', 'devices'] },
      { slug: 'cybersecurity', name: 'Cybersecurity', labelKey: 'category.cybersecurity', description: 'Attacks, fraud and how to stay safe online.', aliases: ['cybersecurity', 'security', 'cyber'] },
      { slug: 'space', name: 'Space', labelKey: 'category.space', description: 'Satellites, rockets and what goes up.', aliases: ['space'] },
      { slug: 'apps', name: 'Apps', labelKey: 'category.apps', description: 'Software people run on a phone.', aliases: ['apps', 'software', 'mobile-apps'] },
    ],
  },
  {
    slug: 'sports',
    name: 'Sports',
    labelKey: 'category.sports',
    description: 'Results, transfers and the leagues a reader follows.',
    aliases: ['sports', 'sport', 'amasport', 'amasports', 'imikino'],
    children: [
      { slug: 'football', name: 'Football', labelKey: 'category.football', description: 'The beautiful game.', aliases: ['football', 'soccer'] },
      { slug: 'basketball', name: 'Basketball', labelKey: 'category.basketball', description: 'Courts and leagues.', aliases: ['basketball'] },
      { slug: 'cricket', name: 'Cricket', labelKey: 'category.cricket', description: 'Tests, limited overs and leagues.', aliases: ['cricket'] },
      { slug: 'tennis', name: 'Tennis', labelKey: 'category.tennis', description: 'Tours and grand slams.', aliases: ['tennis'] },
      { slug: 'esports', name: 'Esports', labelKey: 'category.esports', description: 'Competitive gaming.', aliases: ['esports', 'e-sports', 'gaming-competitions'] },
    ],
  },
  {
    slug: 'entertainment',
    name: 'Entertainment',
    labelKey: 'category.entertainment',
    description: 'Film, music, culture and the people in front of the camera.',
    aliases: ['entertainment', 'ibisindi', 'amuseke', 'culture'],
    children: [
      { slug: 'movies', name: 'Movies', labelKey: 'category.movies', description: 'Films, premieres and reviews.', aliases: ['movies', 'film', 'cinema'] },
      { slug: 'music', name: 'Music', labelKey: 'category.music', description: 'Artists, releases and concerts.', aliases: ['music', 'umuziki'] },
      { slug: 'gaming', name: 'Gaming', labelKey: 'category.gaming', description: 'Games and the people who play them.', aliases: ['gaming'] },
      { slug: 'celebrity', name: 'Celebrity', labelKey: 'category.celebrity', description: 'Public figures and what they do next.', aliases: ['celebrity', 'celebrities'] },
      { slug: 'streaming', name: 'Streaming', labelKey: 'category.streaming', description: 'What is watchable, and where.', aliases: ['streaming'] },
    ],
  },
  {
    slug: 'health',
    name: 'Health',
    labelKey: 'category.health',
    description: 'Medicine, public health, science and the climate around us.',
    aliases: ['health', 'ubuzima', 'imirire', 'medicine'],
    children: [
      { slug: 'wellness', name: 'Wellness', labelKey: 'category.wellness', description: 'Food, fitness and rest.', aliases: ['wellness', 'fitness'] },
      { slug: 'medicine', name: 'Medicine', labelKey: 'category.medicine', description: 'Treatments, drugs and hospitals.', aliases: ['medicine', 'ubuvuzi'] },
      { slug: 'science', name: 'Science', labelKey: 'category.science', description: 'Research and discovery.', aliases: ['science'] },
      { slug: 'climate', name: 'Climate', labelKey: 'category.climate', description: 'Weather, emissions and adaptation.', aliases: ['climate', 'environment'] },
    ],
  },
];

/** 'Amasport', 'Amasports' and 'amasport-sports' all name the same section. */
function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

const NODE_BY_ALIAS = new Map();
SECTIONS.forEach((section, index) => {
  section.order = (index + 1) * 10;
  section.parentSlug = null;
  NODE_BY_ALIAS.set(normalize(section.slug), { section, child: null });
  section.aliases.forEach((alias) => {
    if (!NODE_BY_ALIAS.has(normalize(alias))) NODE_BY_ALIAS.set(normalize(alias), { section, child: null });
  });
  section.children.forEach((child, childIndex) => {
    child.order = (childIndex + 1) * 10;
    child.parentSlug = section.slug;
    [child.slug, ...child.aliases].forEach((alias) => {
      if (!NODE_BY_ALIAS.has(normalize(alias))) NODE_BY_ALIAS.set(normalize(alias), { section, child });
    });
  });
});

/** The section (and sub-section) a stored slug belongs to. */
function findNode(slugOrName) {
  return NODE_BY_ALIAS.get(normalize(slugOrName)) || null;
}

/** Every spelling that names one node, including the one asked for. */
function nodeSlugs(node) {
  if (!node) return [];
  const target = node.child || node.section;
  const set = new Set([target.slug, ...target.aliases, String(target.slug)]);
  return [...set];
}

/** The node's own spellings plus, for a section, every sub-section's too. */
function sectionSlugs(node) {
  const set = new Set(nodeSlugs(node));
  if (node && !node.child) {
    node.section.children.forEach((child) => nodeSlugs({ section: node.section, child }).forEach((slug) => set.add(slug)));
  }
  return [...set];
}

module.exports = { SECTIONS, normalize, findNode, nodeSlugs, sectionSlugs };
