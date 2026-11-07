import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type TouchEvent } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Clock3, Eye } from 'lucide-react'
import type { Article, Category } from '../../types'
import { useI18n } from '../../context/I18nContext'
import { cn } from '../../utils/cn'
import MediaImage from '../common/MediaImage'

const AUTO_ADVANCE_MS = 6000
const MAX_SLIDES = 6

type SlideCategory = { name: string; href: string; key: string }
type Slide = { article: Article; category: SlideCategory | null }

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/** publishedAt/createdAt can be missing or malformed — never hand NaN to the sort. */
function articleTimestamp(article: Article): number {
  const raw = article.publishedAt || article.createdAt
  if (!raw) return 0
  const parsed = new Date(raw).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

function isSameLocalDay(timestamp: number, now: Date): boolean {
  if (!timestamp) return false
  const date = new Date(timestamp)
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

/** article.category is either a populated object or a bare id/name string. */
function slideCategory(article: Article, categories: Category[]): SlideCategory | null {
  const populated = typeof article.category === 'object' && article.category !== null ? article.category : null
  if (populated) {
    return { name: populated.name, href: `/category/${populated.slug}`, key: populated.slug || populated.name }
  }
  if (typeof article.category === 'string' && article.category) {
    const match = categories.find((item) => item._id === article.category || item.name === article.category)
    if (match) return { name: match.name, href: `/category/${match.slug}`, key: match.slug || match.name }
  }
  return null
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(query.matches)
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return reduced
}

function usePageVisible(): boolean {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    if (typeof document === 'undefined') return
    setVisible(document.visibilityState !== 'hidden')
    const onVisibility = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])
  return visible
}

function SlideImage({ article, className = '', eager = false }: { article: Article; className?: string; eager?: boolean }) {
  if (article.featuredImage) {
    return <MediaImage className={className} src={article.featuredImage} alt="" loading={eager ? 'eager' : 'lazy'} />
  }
  return (
    <div className={cn(className, 'flex items-center justify-center bg-gradient-to-br from-blue-900 via-blue-700 to-cyan-500')} aria-hidden="true">
      <span className="rounded-full border border-white/40 px-3 py-1 text-xs font-bold tracking-widest text-white/90">Ijwi ry'ukuri</span>
    </div>
  )
}

interface NewsBannerProps {
  articles: Article[]
  categories?: Category[]
}

export default function NewsBanner({ articles, categories = [] }: NewsBannerProps) {
  const { t } = useI18n()
  const [index, setIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const reducedMotion = usePrefersReducedMotion()
  const pageVisible = usePageVisible()

  const slides = useMemo<Slide[]>(() => {
    const usable = articles.filter((article) => article && article._id && article.slug && article.title)
    const sorted = [...usable].sort((a, b) => articleTimestamp(b) - articleTimestamp(a))
    const now = new Date()
    const todays = sorted.filter((article) => isSameLocalDay(articleTimestamp(article), now))
    // Fall back to the most recent articles when nothing was published today.
    const pool = todays.length ? todays : sorted

    const leads = new Map<string, Slide>()
    pool.forEach((article) => {
      const category = slideCategory(article, categories)
      const key = category ? category.key : 'other'
      // Sorted newest-first, so the first article seen per category is its newest one.
      if (!leads.has(key)) leads.set(key, { article, category })
    })
    return Array.from(leads.values()).slice(0, MAX_SLIDES)
  }, [articles, categories])

  const count = slides.length

  useEffect(() => {
    setIndex((current) => (current < count ? current : 0))
  }, [count])

  const autoPlay = count > 1 && pageVisible && !hovered && !focused && !reducedMotion
  useEffect(() => {
    if (!autoPlay) return
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % count)
    }, AUTO_ADVANCE_MS)
    return () => window.clearInterval(timer)
  }, [autoPlay, count])

  const goTo = useCallback(
    (target: number) => {
      if (!count) return
      setIndex(((target % count) + count) % count)
    },
    [count],
  )

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      goTo(index + 1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      goTo(index - 1)
    }
  }

  const touchStartX = useRef<number | null>(null)
  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    touchStartX.current = event.touches[0]?.clientX ?? null
  }
  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStartX.current
    touchStartX.current = null
    if (start === null) return
    const delta = (event.changedTouches[0]?.clientX ?? start) - start
    if (Math.abs(delta) < 40) return
    goTo(delta < 0 ? index + 1 : index - 1)
  }

  if (!count) return null

  return (
    <div
      className="group relative overflow-hidden rounded-xl bg-slate-900 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
      role="region"
      aria-roledescription="carousel"
      aria-label={t('home.top')}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <div
        className="aspect-[4/3] overflow-hidden sm:aspect-[16/9] lg:aspect-[16/8]"
        aria-live={autoPlay ? 'off' : 'polite'}
        aria-atomic="false"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flex h-full w-full transition-transform duration-700 ease-out will-change-transform motion-reduce:transition-none"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {slides.map((slide, position) => {
            const article = slide.article
            const active = position === index
            const readingTime = safeNumber(article.readingTime, 3) || 3
            const views = safeNumber(article.views, 0)
            const timestamp = articleTimestamp(article)
            const otherName = slide.category ? slide.category.name : t('category.other')
            const otherHref = slide.category ? slide.category.href : '/categories'

            return (
              <div
                key={article._id}
                className="relative h-full w-full shrink-0 grow-0 basis-full"
                aria-hidden={active ? undefined : true}
              >
                <SlideImage article={article} eager={position < 2} className="absolute inset-0 h-full w-full object-cover" />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/55 to-black/10" aria-hidden="true" />

                <div className="absolute inset-x-0 bottom-0 p-4 pr-6 sm:p-6 sm:pr-8">
                  <Link
                    to={otherHref}
                    tabIndex={active ? undefined : -1}
                    className="inline-flex items-center rounded-full bg-blue-600 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-blue-500 sm:text-xs"
                  >
                    {otherName}
                  </Link>
                  <Link to={`/article/${article.slug}`} tabIndex={active ? undefined : -1} className="mt-2 block pr-10 sm:pr-16">
                    <h3 className="line-clamp-2 text-base font-extrabold leading-snug text-white drop-shadow-sm sm:text-xl lg:text-2xl">
                      {article.title}
                    </h3>
                  </Link>
                  <p className="mt-2 hidden line-clamp-2 max-w-3xl text-xs leading-relaxed text-slate-200 pr-16 sm:block sm:text-sm">
                    {article.summary}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pr-20 text-[11px] text-slate-300 sm:pr-24 sm:text-xs">
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                      {readingTime} {t('articles.minRead')}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                      {views.toLocaleString()} {t('articles.views')}
                    </span>
                    <span className="hidden items-center gap-1 sm:inline-flex">
                      {timestamp ? new Date(timestamp).toLocaleDateString() : t('articles.unknownDate')}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            aria-label="Previous slide"
            className="absolute left-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white sm:h-9 sm:w-9"
          >
            <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            aria-label="Next slide"
            className="absolute right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white sm:h-9 sm:w-9"
          >
            <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
          </button>

          <div className="absolute bottom-3 right-4 z-10 flex items-center gap-2 sm:bottom-4 sm:right-6" role="tablist" aria-label="Banner slides">
            {slides.map((slide, position) => (
              <button
                key={slide.article._id}
                type="button"
                role="tab"
                aria-selected={position === index}
                aria-current={position === index ? 'true' : undefined}
                aria-label={`Slide ${position + 1}: ${slide.article.title}`}
                onClick={() => goTo(position)}
                className="-mx-0.5 flex h-7 items-center px-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <span
                  className={cn(
                    'block rounded-full transition-all duration-300',
                    position === index ? 'h-2 w-6 bg-white' : 'h-2 w-2 bg-white/45',
                  )}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
