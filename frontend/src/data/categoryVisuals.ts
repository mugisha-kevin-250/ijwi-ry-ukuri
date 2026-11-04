import type { Category } from '../types'

/**
 * The database holds both English and Kinyarwanda categories that describe the
 * same topic (sports/amasport, technology/teknolojia, ...). Each group lists the
 * aliases that must collapse into one card, keeping `slug` as the link target.
 */
export interface CategoryVisual {
  slug: string
  aliases: string[]
  /** i18n key used as the card title; falls back to the stored category name. */
  labelKey?: string
  image: string
}

export const CATEGORY_VISUALS: CategoryVisual[] = [
  { slug: 'rwanda', aliases: ['rwanda'], labelKey: 'category.rwanda', image: '/images/categories/rwanda.png' },
  { slug: 'africa', aliases: ['africa'], image: '/images/categories/africa.png' },
  { slug: 'world', aliases: ['world'], image: '/images/categories/world.png' },
  { slug: 'politik', aliases: ['politik', 'politics'], labelKey: 'category.politics', image: '/images/categories/politics.png' },
  { slug: 'business', aliases: ['business', 'ubucuruzi', 'economy'], labelKey: 'category.business', image: '/images/categories/business.png' },
  { slug: 'technology', aliases: ['technology', 'teknolojia', 'teknolojiya'], labelKey: 'category.technology', image: '/images/categories/technology.png' },
  { slug: 'sports', aliases: ['sports', 'amasport'], labelKey: 'category.sports', image: '/images/categories/sports.png' },
  { slug: 'entertainment', aliases: ['entertainment', 'ibisindi'], labelKey: 'category.entertainment', image: '/images/categories/entertainment.png' },
  { slug: 'health', aliases: ['health', 'ubuzima', 'imirire'], labelKey: 'category.health', image: '/images/categories/health.png' },
  { slug: 'education', aliases: ['education'], image: '/images/categories/education.png' },
  { slug: 'campus', aliases: ['campus'], image: '/images/categories/campus.png' },
  { slug: 'jobs', aliases: ['jobs'], image: '/images/categories/jobs.png' },
  { slug: 'opportunities', aliases: ['opportunities'], image: '/images/categories/opportunities.png' },
  { slug: 'lifestyle', aliases: ['lifestyle'], image: '/images/categories/lifestyle.png' },
  { slug: 'opinions', aliases: ['opinions'], image: '/images/categories/opinions.png' },
  { slug: 'ibindi', aliases: ['ibindi', 'other'], labelKey: 'category.other', image: '/images/categories/other.png' },
]

const ALIAS_TO_VISUAL = new Map<string, CategoryVisual>()
CATEGORY_VISUALS.forEach((visual) => {
  ALIAS_TO_VISUAL.set(visual.slug, visual)
  visual.aliases.forEach((alias) => ALIAS_TO_VISUAL.set(alias, visual))
})

export interface ResolvedCategory {
  category: Category
  visual: CategoryVisual
}

const FALLBACK_VISUAL: CategoryVisual = { slug: '', aliases: [], image: '' }

/** Collapses duplicate language variants of the same topic into a single card. */
export function resolveCategories(categories: Category[]): ResolvedCategory[] {
  const grouped = new Map<string, ResolvedCategory>()
  const unknown: ResolvedCategory[] = []

  categories.forEach((category) => {
    const visual = ALIAS_TO_VISUAL.get(category.slug)
    if (!visual) {
      unknown.push({ category, visual: { ...FALLBACK_VISUAL, slug: category.slug } })
      return
    }
    const current = grouped.get(visual.slug)
    const prefersThis = !current || (current.category.slug !== visual.slug && category.slug === visual.slug)
    if (prefersThis) grouped.set(visual.slug, { category, visual })
  })

  const known = CATEGORY_VISUALS.filter((visual) => grouped.has(visual.slug)).map((visual) => grouped.get(visual.slug)!)
  return [...known, ...unknown]
}
