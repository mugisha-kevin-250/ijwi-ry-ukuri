import type { Category } from '../types'

/**
 * The newsroom holds the same section twice, once in English and once in
 * Kinyarwanda (sports/amasport, technology/teknolojia, ...). Each group lists
 * every spelling that must collapse into one section, so a writer picks a
 * section once and readers see it in their own language.
 */
export interface CategoryVisual {
  /** Canonical slug for the group; the stored category keeps its own slug in links. */
  slug: string
  aliases: string[]
  /** i18n key used as the section name; falls back to the stored category name. */
  labelKey?: string
  image: string
}

export const CATEGORY_VISUALS: CategoryVisual[] = [
  { slug: 'rwanda', aliases: ['rwanda'], labelKey: 'category.rwanda', image: '/images/categories/rwanda.png' },
  { slug: 'africa', aliases: ['africa'], image: '/images/categories/africa.png' },
  { slug: 'world', aliases: ['world'], image: '/images/categories/world.png' },
  { slug: 'politik', aliases: ['politik', 'politics', 'politiki'], labelKey: 'category.politics', image: '/images/categories/politics.png' },
  { slug: 'business', aliases: ['business', 'ubucuruzi', 'economy'], labelKey: 'category.business', image: '/images/categories/business.png' },
  { slug: 'technology', aliases: ['technology', 'teknolojia', 'teknolojiya', 'tekonolojiya', 'ikoranabuhanga'], labelKey: 'category.technology', image: '/images/categories/technology.png' },
  { slug: 'sports', aliases: ['sports', 'sport', 'amasport', 'amasports', 'imikino'], labelKey: 'category.sports', image: '/images/categories/sports.png' },
  { slug: 'entertainment', aliases: ['entertainment', 'ibisindi', 'amuseke'], labelKey: 'category.entertainment', image: '/images/categories/entertainment.png' },
  { slug: 'health', aliases: ['health', 'ubuzima', 'imirire'], labelKey: 'category.health', image: '/images/categories/health.png' },
  { slug: 'education', aliases: ['education', 'amahuguro'], image: '/images/categories/education.png' },
  { slug: 'campus', aliases: ['campus'], image: '/images/categories/campus.png' },
  { slug: 'jobs', aliases: ['jobs'], image: '/images/categories/jobs.png' },
  { slug: 'opportunities', aliases: ['opportunities'], image: '/images/categories/opportunities.png' },
  { slug: 'lifestyle', aliases: ['lifestyle'], image: '/images/categories/lifestyle.png' },
  { slug: 'opinions', aliases: ['opinions'], image: '/images/categories/opinions.png' },
  { slug: 'ibindi', aliases: ['ibindi', 'other'], labelKey: 'category.other', image: '/images/categories/other.png' },
]

const FALLBACK_VISUAL: CategoryVisual = { slug: '', aliases: [], image: '' }

/** 'Amasport', 'Amasports' and 'amasport-sports' all name the same section. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

const ALIAS_TO_VISUAL = new Map<string, CategoryVisual>()
CATEGORY_VISUALS.forEach((visual) => {
  ALIAS_TO_VISUAL.set(normalize(visual.slug), visual)
  visual.aliases.forEach((alias) => ALIAS_TO_VISUAL.set(normalize(alias), visual))
})

function visualFor(category?: { slug?: string; name?: string } | null): CategoryVisual | undefined {
  if (!category) return undefined
  return ALIAS_TO_VISUAL.get(normalize(category.slug || '')) || ALIAS_TO_VISUAL.get(normalize(category.name || ''))
}

/**
 * The section name in the language the reader is reading in, so a category
 * stored as "Amasport" is offered as Sports, Imikino, Sport or Michezo.
 */
export function categoryLabel(
  category: { slug?: string; name?: string } | null | undefined,
  t: (key: string) => string,
): string {
  const labelKey = visualFor(category)?.labelKey
  return labelKey ? t(labelKey) : category?.name || ''
}

/** The canonical section this stored category belongs to. */
export function categoryGroupSlug(category?: { slug?: string; name?: string } | null): string {
  return visualFor(category)?.slug || category?.slug || ''
}

/** Every slug that names this section, so a page can show both stored copies. */
export function categoryGroupSlugs(category: { slug?: string; name?: string } | null | undefined): string[] {
  const visual = visualFor(category)
  if (!visual) return []
  return [...new Set([visual.slug, ...visual.aliases])]
}

export interface ResolvedCategory {
  category: Category
  visual: CategoryVisual
}

/** Collapses duplicate language variants of the same topic into a single card. */
export function resolveCategories(categories: Category[]): ResolvedCategory[] {
  const grouped = new Map<string, ResolvedCategory>()
  const unknown: ResolvedCategory[] = []

  categories.forEach((category) => {
    const visual = visualFor(category)
    if (!visual) {
      unknown.push({ category, visual: { ...FALLBACK_VISUAL, slug: category.slug } })
      return
    }
    const current = grouped.get(visual.slug)
    // The copy whose slug is the canonical one becomes the section's link target.
    const prefersThis = !current || (current.category.slug !== visual.slug && category.slug === visual.slug)
    if (prefersThis) grouped.set(visual.slug, { category, visual })
  })

  const known = CATEGORY_VISUALS.filter((visual) => grouped.has(visual.slug)).map((visual) => grouped.get(visual.slug)!)
  return [...known, ...unknown]
}

/**
 * Writers pick a section once, so a story saved under a duplicate copy of the
 * same section ("Amasport") is moved to the canonical copy ("Sports").
 */
export function canonicalCategoryId(categories: Category[], categoryId: string): string {
  const chosen = categories.find((category) => String(category._id) === String(categoryId))
  if (!chosen) return categoryId
  const resolved = resolveCategories(categories).find((item) => item.visual.slug === visualFor(chosen)?.slug)
  return resolved ? String(resolved.category._id) : categoryId
}
