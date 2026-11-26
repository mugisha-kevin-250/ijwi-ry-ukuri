import type { Category } from '../types'
import { sectionHrefFor } from './sections'

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
  { slug: 'technology', aliases: ['technology', 'tech', 'tehnologija', 'teknolojia', 'tekonolojiya', 'ikoranabuhanga'], labelKey: 'category.technology', image: '/images/categories/technology.png' },
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

/** The picture a section is printed with; sections outside the table get none. */
export function categoryImage(category?: { slug?: string; name?: string } | null): string | undefined {
  return visualFor(category)?.image || undefined
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

/**
 * Every reader link to a section goes to one address, so 'Sports' and 'Amasport'
 * never split their readers and their search ranking in two. A section that is
 * part of the published tree gets its own short address (/sports, or
 * /sports/football for a sub-section); anything outside it keeps the category
 * page it has always had.
 */
export function categoryHref(category: { slug?: string; name?: string } | null | undefined): string {
  return sectionHrefFor(category) || `/category/${categoryGroupSlug(category)}`
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


export interface CommonsCategoryImage {
  url: string
  pageUrl: string
  credit: string
  width: number
  height: number
}
const commonsImageCache = new Map<string, Promise<CommonsCategoryImage | null>>()
const CATEGORY_SEARCH_TERMS: Record<string, string> = {
  rwanda: 'Kigali Rwanda city landscape',
  trending: 'breaking news newspaper journalism',
  globalleaders: 'world leaders summit diplomacy',
  personalfinance: 'personal finance budgeting money',
  apps: 'mobile apps smartphone software',
  esports: 'esports gaming arena tournament',
  celebrity: 'celebrity red carpet portrait',
  streaming: 'streaming television film media',
  africa: 'African landscape wildlife city',
  world: 'Earth planet world landscape',
  politics: 'parliament government building chamber',
  business: 'business office commerce company',
  tech: 'technology computer electronics',
  sports: 'football stadium sports athletics',
  entertainment: 'music concert film entertainment',
  health: 'healthcare hospital medical',
  education: 'university classroom education',
  campus: 'university campus students',
  jobs: 'workplace professionals employment',
  opportunities: 'scholarship students graduation',
  lifestyle: 'travel lifestyle food culture',
  opinions: 'newspaper editorial journalism',
  other: 'community people society',
  football: 'football soccer stadium match',
  basketball: 'basketball court game',
  cricket: 'cricket stadium match',
  tennis: 'tennis court tournament',
  elections: 'election voting ballot',
  diplomacy: 'diplomacy international meeting',
  markets: 'stock exchange financial market',
  economy: 'economic industry trade',
  crypto: 'bitcoin cryptocurrency technology',
  energy: 'renewable energy solar power',
  ai: 'artificial intelligence robotics',
  gadgets: 'smartphone laptop electronics',
  cybersecurity: 'cybersecurity computer security',
  space: 'space telescope rocket',
  movies: 'cinema film production',
  music: 'music concert stage',
  gaming: 'video game esports',
  wellness: 'fitness wellness exercise',
  medicine: 'medical research hospital',
  science: 'science laboratory research',
  climate: 'climate environment nature',
  middleeast: 'Middle East city landscape',
  americas: 'Americas city landscape',
  europe: 'Europe city landscape',
  asiapacific: 'Asia Pacific landscape',
}
function categorySearchTerm(label: string): string {
  const key = normalize(label).replace(/[^a-z0-9]/g, '')
  const mapped = CATEGORY_SEARCH_TERMS[key]
  return mapped || (label + ' news photography')
}
/**
 * Search Wikimedia Commons for an actual photograph whose original file is
 * UHD 4K (3840x2160 landscape or 2160x3840 portrait). No upscaling or
 * dimension claims based on a filename; Commons imageinfo supplies pixels.
 */
export function search4kCategoryImage(label: string): Promise<CommonsCategoryImage | null> {
  const query = String(label || '').trim()
  if (!query) return Promise.resolve(null)
  const key = normalize(query)
  const cached = commonsImageCache.get(key)
  if (cached) return cached
  const request = (async () => {
    const api = new URL('https://commons.wikimedia.org/w/api.php')
    api.searchParams.set('action', 'query')
    api.searchParams.set('format', 'json')
    api.searchParams.set('generator', 'search')
    api.searchParams.set('gsrnamespace', '6')
    api.searchParams.set('gsrlimit', '50')
    api.searchParams.set('gsrsearch', 'filetype:bitmap ' + categorySearchTerm(query))
    api.searchParams.set('prop', 'imageinfo')
    api.searchParams.set('iiprop', 'url|size|mime|extmetadata')
    api.searchParams.set('iiurlwidth', '3840')
    api.searchParams.set('origin', '*')
    const response = await fetch(api.toString(), { headers: { accept: 'application/json' } })
    if (!response.ok) throw new Error('Wikimedia Commons image search failed')
    const payload = await response.json()
    const pages = Object.values(payload?.query?.pages || {}) as any[]
    const candidates = pages.map(page => {
      const info = page?.imageinfo?.[0]
      if (!info || !/^image\/(jpeg|png|webp)$/i.test(info.mime || '')) return null
      const width = Number(info.width) || 0
      const height = Number(info.height) || 0
      const isUhd = (width >= 3840 && height >= 2160) || (height >= 3840 && width >= 2160)
      if (!isUhd) return null
      const thumbWidth = Number(info.thumbwidth) || 0
      const thumbHeight = Number(info.thumbheight) || 0
      const thumbIsUhd = (thumbWidth >= 3840 && thumbHeight >= 2160) || (thumbHeight >= 3840 && thumbWidth >= 2160)
      const metadata = info.extmetadata || {}
      const artist = String(metadata.Artist?.value || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
      const license = String(metadata.LicenseShortName?.value || '').replace(/<[^>]*>/g, '').trim()
      return {
        url: thumbIsUhd && info.thumburl ? info.thumburl : info.url,
        pageUrl: info.descriptionurl || '',
        credit: [artist || 'Wikimedia Commons contributor', 'Wikimedia Commons', license].filter(Boolean).join(' · ').slice(0, 180),
        width,
        height,
        isPhoto: /photograph|photo/i.test(String(info.extmetadata?.ImageDescription?.value || '')),
      }
    }).filter(Boolean) as (CommonsCategoryImage & { isPhoto: boolean })[]
    candidates.sort((a,b) => Number(b.isPhoto)-Number(a.isPhoto))
    return candidates[0] || null
  })().catch(error => {
    commonsImageCache.delete(key)
    throw error
  })
  commonsImageCache.set(key, request)
  return request
}
