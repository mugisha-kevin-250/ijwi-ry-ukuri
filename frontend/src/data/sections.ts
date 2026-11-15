/**
 * The sections the site publishes, in the order the header shows them, with the
 * sub-sections under each. This mirrors `backend/src/utils/categoryTree.js`:
 * the backend list seeds the database and resolves aliases, this one paints the
 * navigation and builds the addresses, so a reader gets a section page the
 * moment the HTML arrives instead of waiting for a request.
 *
 * `labelKey` is the i18n key the section is printed with, so the same stored
 * category reads as Sports, Imikino, Sport or Michezo.
 */
export interface SectionNode {
  slug: string
  labelKey: string
  /** The name the newsroom stores for this section. Only a section outside the
   *  published table needs it: the ones in the table are printed from their
   *  `labelKey`, so the same section reads as Sports, Imikino or Michezo. */
  name?: string
  aliases: string[]
  children: SectionNode[]
}

export const SECTIONS: SectionNode[] = [
  { slug: 'trending', labelKey: 'category.trending', aliases: ['trending'], children: [] },
  { slug: 'rwanda', labelKey: 'category.rwanda', aliases: ['rwanda'], children: [] },
  {
    slug: 'world',
    labelKey: 'category.world',
    aliases: ['world', 'international', 'isi'],
    children: [
      { slug: 'middle-east', labelKey: 'category.middleEast', aliases: ['middle-east', 'middleeast'], children: [] },
      { slug: 'africa', labelKey: 'category.africa', aliases: ['africa'], children: [] },
      { slug: 'americas', labelKey: 'category.americas', aliases: ['americas', 'america'], children: [] },
      { slug: 'europe', labelKey: 'category.europe', aliases: ['europe'], children: [] },
      { slug: 'asia-pacific', labelKey: 'category.asiaPacific', aliases: ['asia-pacific', 'asiapacific', 'asia'], children: [] },
    ],
  },
  {
    slug: 'politics',
    labelKey: 'category.politics',
    aliases: ['politics', 'politik', 'politiki'],
    children: [
      { slug: 'elections', labelKey: 'category.elections', aliases: ['elections', 'amatora'], children: [] },
      { slug: 'diplomacy', labelKey: 'category.diplomacy', aliases: ['diplomacy', 'diplomatic'], children: [] },
      { slug: 'global-leaders', labelKey: 'category.globalLeaders', aliases: ['global-leaders', 'leaders', 'heads-of-state'], children: [] },
    ],
  },
  {
    slug: 'business',
    labelKey: 'category.business',
    aliases: ['business', 'ubucuruzi', 'companies'],
    children: [
      { slug: 'markets', labelKey: 'category.markets', aliases: ['markets'], children: [] },
      { slug: 'economy', labelKey: 'category.economy', aliases: ['economy'], children: [] },
      { slug: 'crypto', labelKey: 'category.crypto', aliases: ['crypto', 'cryptocurrency'], children: [] },
      { slug: 'energy', labelKey: 'category.energy', aliases: ['energy', 'power'], children: [] },
      { slug: 'personal-finance', labelKey: 'category.personalFinance', aliases: ['personal-finance', 'finance', 'money'], children: [] },
    ],
  },
  {
    slug: 'tech',
    labelKey: 'category.tech',
    aliases: ['tech', 'technology', 'tehnologija', 'teknolojia', 'teknolojiya', 'tekonolojiya', 'ikoranabuhanga'],
    children: [
      { slug: 'ai', labelKey: 'category.ai', aliases: ['ai', 'artificial-intelligence'], children: [] },
      { slug: 'gadgets', labelKey: 'category.gadgets', aliases: ['gadgets', 'hardware', 'devices'], children: [] },
      { slug: 'cybersecurity', labelKey: 'category.cybersecurity', aliases: ['cybersecurity', 'security', 'cyber'], children: [] },
      { slug: 'space', labelKey: 'category.space', aliases: ['space'], children: [] },
      { slug: 'apps', labelKey: 'category.apps', aliases: ['apps', 'software', 'mobile-apps'], children: [] },
    ],
  },
  {
    slug: 'sports',
    labelKey: 'category.sports',
    aliases: ['sports', 'sport', 'amasport', 'amasports', 'imikino'],
    children: [
      { slug: 'football', labelKey: 'category.football', aliases: ['football', 'soccer'], children: [] },
      { slug: 'basketball', labelKey: 'category.basketball', aliases: ['basketball'], children: [] },
      { slug: 'cricket', labelKey: 'category.cricket', aliases: ['cricket'], children: [] },
      { slug: 'tennis', labelKey: 'category.tennis', aliases: ['tennis'], children: [] },
      { slug: 'esports', labelKey: 'category.esports', aliases: ['esports', 'e-sports'], children: [] },
    ],
  },
  {
    slug: 'entertainment',
    labelKey: 'category.entertainment',
    aliases: ['entertainment', 'ibisindi', 'amuseke', 'culture'],
    children: [
      { slug: 'movies', labelKey: 'category.movies', aliases: ['movies', 'film', 'cinema'], children: [] },
      { slug: 'music', labelKey: 'category.music', aliases: ['music', 'umuziki'], children: [] },
      { slug: 'gaming', labelKey: 'category.gaming', aliases: ['gaming'], children: [] },
      { slug: 'celebrity', labelKey: 'category.celebrity', aliases: ['celebrity', 'celebrities'], children: [] },
      { slug: 'streaming', labelKey: 'category.streaming', aliases: ['streaming'], children: [] },
    ],
  },
  {
    slug: 'health',
    labelKey: 'category.health',
    aliases: ['health', 'ubuzima', 'imirire', 'medicine'],
    children: [
      { slug: 'wellness', labelKey: 'category.wellness', aliases: ['wellness', 'fitness'], children: [] },
      { slug: 'medicine', labelKey: 'category.medicine', aliases: ['medicine', 'ubuvuzi'], children: [] },
      { slug: 'science', labelKey: 'category.science', aliases: ['science'], children: [] },
      { slug: 'climate', labelKey: 'category.climate', aliases: ['climate', 'environment'], children: [] },
    ],
  },
];

/**
 * A link that sits inside a section's panel but is a page of the site rather
 * than a shelf of the archive.
 *
 * These are deliberately not in `SECTIONS`: that table also resolves stored
 * categories to addresses, and nothing can be filed under "Live Scores" - there
 * is no such category, and a story tagged that way would be sent to a page that
 * does not hold stories. A feature is navigation with a destination, nothing
 * more, which is why it has an `href` instead of an `aliases` list.
 */
export interface SectionFeature {
  /** Which section's panel this belongs under. */
  parent: string
  slug: string
  labelKey: string
  href: string
  /** Whether the panel should mark it as something happening right now. */
  live?: boolean
}

export const SECTION_FEATURES: SectionFeature[] = [
  // Named for what the reader is looking for - the sport, live - rather than for
  // the software, and it sits under Sports because that is where a reader reaches
  // for it.
  { parent: 'sports', slug: 'live-sports', labelKey: 'nav.liveSports', href: '/live-sports', live: true },
]

export function featuresFor(sectionSlug: string): SectionFeature[] {
  return SECTION_FEATURES.filter((feature) => feature.parent === sectionSlug)
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

const NODE_BY_ALIAS = new Map<string, { section: SectionNode; child: SectionNode | null }>()
SECTIONS.forEach((section) => {
  [section.slug, ...section.aliases].forEach((alias) => {
    const key = normalize(alias)
    if (!NODE_BY_ALIAS.has(key)) NODE_BY_ALIAS.set(key, { section, child: null })
  })
  section.children.forEach((child) => {
    [child.slug, ...child.aliases].forEach((alias) => {
      const key = normalize(alias)
      if (!NODE_BY_ALIAS.has(key)) NODE_BY_ALIAS.set(key, { section, child })
    })
  })
})

export function findSection(slug?: string | null): SectionNode | undefined {
  return slug ? SECTIONS.find((section) => section.slug === slug.toLowerCase()) : undefined
}

/**
 * The one address a stored category is published at. A story tagged "Amasport"
 * and one tagged "Sports" share /sports, and a story filed under Football is
 * reachable from both /sports and /sports/football.
 */
export function sectionHrefFor(category?: { slug?: string; name?: string } | null): string | null {
  if (!category) return null
  const node = NODE_BY_ALIAS.get(normalize(category.slug || '')) || NODE_BY_ALIAS.get(normalize(category.name || ''))
  if (!node) return null
  return node.child ? `/${node.section.slug}/${node.child.slug}` : `/${node.section.slug}`
}

/** The section and sub-section a URL names, or nothing when it names neither. */
export function resolveSectionPath(sectionSlug?: string, childSlug?: string) {
  const section = findSection(sectionSlug)
  if (!section) return null
  if (!childSlug) return { section, child: null }
  const child = section.children.find((item) => item.slug === childSlug.toLowerCase())
  return child ? { section, child } : null
}
