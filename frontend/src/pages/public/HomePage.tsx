import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  Clock3,
  Eye,
  Heart,
  Mail,
  Share2,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react'
import type { Article, Category } from '../../types'
import { newsletterAPI, publicAPI, type TopWriter } from '../../services/api'
import { useI18n } from '../../context/I18nContext'
import NewsBanner from '../../components/news/NewsBanner'
import NewsAlertsCard from '../../components/pwa/NewsAlertsCard'
import AskRadarAi from '../../components/ai/AskRadarAi'
import Avatar from '../../components/common/Avatar'
import MediaImage from '../../components/common/MediaImage'
import { cn } from '../../utils/cn'
import { useSeo } from '../../utils/useSeo'
import { useArticleLike, useAuthorFollow } from '../../utils/engagementStore'
import { shareArticle } from '../../utils/shareArticle'
import { categoryHref, categoryLabel } from '../../data/categoryVisuals'
import { SECTIONS, sectionHrefFor, type SectionNode } from '../../data/sections'

const NEWSLETTER_KEY = 'radar-newsletter'
const LEGACY_NEWSLETTER_KEY = 'ijwiryukuri-newsletter'

// The home page is the newsroom, so it is built from what is newest. One
// request pulls a wide sheet of stories; the page then shows a third of it and
// hands the rest to "See more news" instead of pretending there is none.
const LATEST_LIMIT = 48
const LATEST_PAGE_ONE = 12

function articleCategory(article: Article) {
  return typeof article.category === 'object' ? article.category : null
}

function ArticleImage({ article, className = '' }: { article: Article; className?: string }) {
  if (article.featuredImage) {
    return <MediaImage className={className} src={article.featuredImage} alt="" loading="lazy" />
  }

  return (
    <div className={`${className} flex items-center justify-center bg-gradient-to-br from-blue-900 via-blue-700 to-cyan-500`} aria-hidden="true">
      <span className="rounded-full border border-white/40 px-3 py-1 text-xs font-bold tracking-widest text-white/90">RADAR</span>
    </div>
  )
}

function SectionHeading({ title, href = '/articles', action }: { title: string; href?: string | null; action?: string }) {
  const { t } = useI18n()
  return (
    <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-2">
      <h2 className="text-lg font-extrabold tracking-tight text-slate-900">{title}</h2>
      {href && (
        <Link to={href} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900">
          {action ?? t('articles.viewAll')}<ChevronRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  )
}

function StoryCard({ article }: { article: Article }) {
  const { t } = useI18n()
  const category = articleCategory(article)
  const author = typeof article.author === 'object' ? article.author : null
  const { liked, likes, toggle: toggleLike } = useArticleLike(article)
  const { following, toggle: toggleFollow } = useAuthorFollow(author?._id, article.followingAuthor)

  const handleLike = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    void toggleLike()
  }

  const handleShare = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    await shareArticle({
      url: `${window.location.origin}/article/${article.slug}`,
      title: article.title,
      text: article.summary,
      copiedLabel: t('articles.linkCopied'),
    })
  }

  const handleFollow = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    void toggleFollow()
  }

  return (
    <article className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <Link to={`/article/${article.slug}`} className="block overflow-hidden">
        <ArticleImage article={article} className="aspect-[16/10] w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
      </Link>
      <div className="p-4">
        {category && (
          <Link
            to={categoryHref(category)}
            className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700 transition hover:bg-blue-100 hover:text-blue-900"
          >
            {categoryLabel(category, t)}
          </Link>
        )}
        <Link to={`/article/${article.slug}`}>
          <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-snug text-slate-900 group-hover:text-blue-800">{article.title}</h3>
        </Link>
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-500">{article.summary}</p>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <span className="inline-flex items-center gap-1"><Clock3 className="h-4 w-4" />{article.readingTime || 3} {t('articles.minRead')}</span>
            <span className="inline-flex items-center gap-1"><Eye className="h-4 w-4" />{(article.views || 0).toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1">
            <Link to={`/article/${article.slug}`} className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium text-blue-700 hover:text-blue-900">
              <BookOpen className="h-4 w-4" />
              {t('articles.readStory')}
            </Link>
          </div>
        </div>
        {article.author && (
          <div className="mt-3 flex items-center justify-between pt-3 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <button
                onClick={handleFollow}
                aria-pressed={following}
                className={cn(
                  'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                  following
                    ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                )}
              >
                <UserPlus className="h-3.5 w-3.5" />
                {following ? t('articles.following') : t('articles.follow')}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleLike}
                aria-pressed={liked}
                className={cn(
                  'inline-flex items-center gap-1 text-sm transition-colors',
                  liked ? 'text-blue-700 font-semibold' : 'text-slate-500 hover:text-blue-700'
                )}
                title={t('writer.likes')}
              >
                <Heart className={cn('h-4 w-4', liked && 'fill-current')} />
                <span>{likes.toLocaleString()}</span>
              </button>
              <button
                onClick={handleShare}
                className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-blue-500 transition-colors"
                title={t('articles.share')}
              >
                <Share2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  )
}

function CompactStory({ article, index }: { article: Article; index?: number }) {
  const { t } = useI18n()
  return (
    <Link to={`/article/${article.slug}`} className="flex gap-3 rounded-lg p-2 transition hover:bg-slate-50">
      {index !== undefined && <span className="w-5 shrink-0 pt-0.5 text-lg font-black leading-none text-blue-800">{index + 1}</span>}
      <ArticleImage article={article} className="h-[62px] w-[82px] shrink-0 rounded-md object-cover" />
      <span className="min-w-0">
        <span className="line-clamp-2 block text-xs font-bold leading-snug text-slate-800">{article.title}</span>
        <span className="mt-1 block truncate text-[10px] text-slate-400">
          {articleCategory(article) ? `${categoryLabel(articleCategory(article), t)} · ` : ''}{article.readingTime || 3} {t('articles.minRead')}
        </span>
      </span>
    </Link>
  )
}

/**
 * Which section a story belongs to, read from the category the API sends with
 * it. Stories that map to no section are left out of the rails rather than
 * dumped into a fake "Other" shelf.
 */
function sectionSlugOf(article: Article): string | null {
  const href = sectionHrefFor(articleCategory(article))
  return href ? href.split('/')[1] || null : null
}

function RailCard({ article }: { article: Article }) {
  const { t } = useI18n()
  return (
    <article className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <Link to={`/article/${article.slug}`} className="block overflow-hidden">
        <ArticleImage article={article} className="aspect-[16/10] w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
      </Link>
      <div className="p-3.5">
        <Link to={`/article/${article.slug}`}>
          <h3 className="line-clamp-3 text-sm font-bold leading-snug text-slate-900 group-hover:text-blue-800">{article.title}</h3>
        </Link>
        <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-slate-400">
          <Clock3 className="h-3.5 w-3.5" />
          {article.readingTime || 3} {t('articles.minRead')}
        </p>
      </div>
    </article>
  )
}

/**
 * One shelf of the newsroom. It is only rendered when the section really has
 * stories in the sheet that was fetched, so an empty desk is never dressed up
 * with someone else's work.
 */
function SectionRail({ section, stories }: { section: SectionNode; stories: Article[] }) {
  const { t } = useI18n()
  if (stories.length < 2) return null
  return (
    <section aria-label={t(section.labelKey)}>
      <div className="mb-4 flex items-center justify-between border-b-2 border-[#062b52] pb-2 dark:border-blue-500">
        <h2 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">{t(section.labelKey)}</h2>
        <Link to={`/${section.slug}`} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900 dark:text-blue-300">
          {t('articles.viewAll')}<ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stories.slice(0, 4).map((article) => (
          <RailCard key={article._id} article={article} />
        ))}
      </div>
    </section>
  )
}

export default function HomePage() {
  const { t } = useI18n()
  useSeo({ path: '/' })
  const [latest, setLatest] = useState<Article[]>([])
  const [totalStories, setTotalStories] = useState(0)
  const [page, setPage] = useState(1)
  const [trending, setTrending] = useState<Article[]>([])
  const [popular, setPopular] = useState<Article[]>([])
  const [topWriters, setTopWriters] = useState<TopWriter[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [visibleLatest, setVisibleLatest] = useState(LATEST_PAGE_ONE)
  // Only a hint that prefills the box; the subscription itself lives on the
  // server. Older builds stored a list of addresses under the old brand name.
  const [newsletterEmail, setNewsletterEmail] = useState(() => {
    const stored = localStorage.getItem(NEWSLETTER_KEY) ?? localStorage.getItem(LEGACY_NEWSLETTER_KEY)
    if (!stored) return ''
    try {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) return String(parsed[parsed.length - 1] || '')
      if (typeof parsed === 'string') return parsed
    } catch {
      return stored
    }
    return ''
  })
  const [newsletterMessage, setNewsletterMessage] = useState('')
  const [newsletterError, setNewsletterError] = useState('')
  const [newsletterBusy, setNewsletterBusy] = useState(false)

  const loadNews = async (targetPage = 1) => {
    setLoading(targetPage === 1)
    setLoadError('')
    const results = await Promise.allSettled([
      publicAPI.getArticles({ page: targetPage, limit: LATEST_LIMIT, sort: 'latest' }),
      targetPage === 1 ? publicAPI.getTrending() : Promise.resolve(null),
      targetPage === 1 ? publicAPI.getPopular() : Promise.resolve(null),
      targetPage === 1 ? publicAPI.getCategories() : Promise.resolve(null),
      targetPage === 1 ? publicAPI.getTopWriters() : Promise.resolve(null),
    ])

    const [latestResult, trendingResult, popularResult, categoriesResult, writersResult] = results
    let failed = false

    if (latestResult.status === 'fulfilled' && latestResult.value) {
      const data = latestResult.value.data.data as any
      const incoming: Article[] = Array.isArray(data) ? data : data?.articles || []
      const total: number = Array.isArray(data) ? incoming.length : data?.total ?? incoming.length
      setLatest((current) => {
        if (targetPage === 1) return incoming
        const seen = new Set(current.map((article) => article._id))
        return [...current, ...incoming.filter((article) => !seen.has(article._id))]
      })
      setTotalStories(total)
      setPage(targetPage)
    } else if (latestResult.status === 'rejected') {
      failed = true
    }

    const readList = (settled: PromiseSettledResult<any>) => {
      if (settled.status !== 'fulfilled' || !settled.value) return null
      const data = settled.value.data.data as any
      return Array.isArray(data) ? data : data?.articles || []
    }
    if (trendingResult.status === 'fulfilled' && trendingResult.value) setTrending(readList(trendingResult) || [])
    if (popularResult.status === 'fulfilled' && popularResult.value) setPopular(readList(popularResult) || [])
    if (categoriesResult.status === 'fulfilled' && categoriesResult.value) {
      const data = categoriesResult.value.data.data as any
      setCategories(Array.isArray(data) ? data : data?.categories || [])
    }
    if (writersResult.status === 'fulfilled' && writersResult.value) {
      const data = writersResult.value.data.data as any
      setTopWriters(Array.isArray(data?.writers) ? data.writers : [])
    }

    if (failed) setLoadError(t('home.loadError'))
    setLoading(false)
    setLoadingMore(false)
  }

  useEffect(() => {
    void loadNews(1)
  }, [])

  // The address now lives on the server, which is the only place that can mail
  // it. What the page says depends on what the server actually did: a mail sent,
  // a mail that could not be sent because no mail server is configured here, or
  // an address that was already on the list.
  const submitNewsletter = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const email = newsletterEmail.trim().toLowerCase()
    if (!email) return
    setNewsletterBusy(true)
    setNewsletterMessage('')
    setNewsletterError('')
    try {
      const result = await newsletterAPI.subscribe(email, 'home')
      if (!result.needsConfirmation) setNewsletterMessage(t('home.newsletterAlready'))
      else if (result.delivered) setNewsletterMessage(t('home.newsletterMailed'))
      else setNewsletterMessage(t('home.newsletterNotMailing'))
      setNewsletterEmail('')
      // Remembering the address on this device only prefills the box next time;
      // it is not a subscription and the page never claims it is.
      localStorage.setItem(NEWSLETTER_KEY, email)
      localStorage.removeItem(LEGACY_NEWSLETTER_KEY)
    } catch (error: any) {
      setNewsletterError(error?.response?.data?.message || t('home.newsletterFailed'))
    } finally {
      setNewsletterBusy(false)
    }
  }

  const featured = latest[0]
  const restOfLatest = latest.filter((article) => article._id !== featured?._id)
  const shownLatest = restOfLatest.slice(0, visibleLatest)
  const hasMoreLocal = restOfLatest.length > shownLatest.length
  const hasMorePages = totalStories > latest.length

  // The shelves are cut from the one sheet of latest stories already in hand, so
  // the home page never asks the API nine times for the same answers.
  const rails = useMemo(() => {
    const buckets = new Map<string, Article[]>()
    latest.forEach((article) => {
      const slug = sectionSlugOf(article)
      if (!slug) return
      const bucket = buckets.get(slug) || []
      if (bucket.length < 4) bucket.push(article)
      buckets.set(slug, bucket)
    })
    // "Trending" is its own shelf fed by the trending feed, not a category rail.
    return SECTIONS.filter((section) => section.slug !== 'trending').map((section) => ({
      section,
      stories: buckets.get(section.slug) || [],
    }))
  }, [latest])

  const sideStories = trending.filter((article) => article._id !== featured?._id).slice(0, 4)
  // No fallback here: showing the trending list under "Popular" would claim
  // those were the most-read stories when the read actually failed.
  const popularStories = popular

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      {/* The breaking strip is gone; the same line of the page now opens the
          question desk. It keeps the top story as its topic so a reader who
          just wants to know what happened can ask about it in one tap. */}
      <AskRadarAi
        variant="strip"
        topic={trending[0]?.title || ''}
        slug={trending[0]?.slug || ''}
        suggestions={[t('ai.suggestToday'), t('ai.suggestRwanda'), t('ai.suggestExplain')]}
      />

      <main className="mx-auto max-w-7xl space-y-9 px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
        {loadError && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span>{loadError}</span>
            <button type="button" onClick={() => void loadNews(1)} className="font-bold underline">{t('home.retry')}</button>
          </div>
        )}

        <section className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(280px,0.9fr)]">
          <div>
            <SectionHeading title={t('home.top')} />
            {loading ? <div className="aspect-[16/8] animate-pulse rounded-xl bg-slate-200" /> : latest.length ? (
              <NewsBanner articles={latest} categories={categories} />
            ) : <div className="flex min-h-[300px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-sm text-slate-500">{t('home.emptyTop')}</div>}
          </div>

          <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <SectionHeading title={t('home.trending')} href="/articles?sort=trending" />
            {loading ? <div className="space-y-3">{[1, 2, 3, 4].map((item) => <div key={item} className="h-[78px] animate-pulse rounded bg-slate-100" />)}</div> : sideStories.length ? (
              <div className="divide-y divide-slate-100">{sideStories.map((article, index) => <CompactStory key={article._id} article={article} index={index} />)}</div>
            ) : <p className="py-8 text-center text-sm text-slate-500">{t('home.emptyTrending')}</p>}
          </aside>
        </section>

        <section>
          <SectionHeading title={t('home.latest')} href="/articles?sort=latest" />
          {loading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[1, 2, 3, 4, 5, 6, 7, 8].map((item) => <div key={item} className="h-72 animate-pulse rounded-xl bg-slate-200" />)}</div> : shownLatest.length ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{shownLatest.map((article) => <StoryCard key={article._id} article={article} />)}</div>
              {(hasMoreLocal || hasMorePages) && (
                <div className="mt-5 flex justify-center">
                  <button
                    type="button"
                    onClick={() => (hasMoreLocal ? setVisibleLatest((count) => count + 8) : void loadNews(page + 1))}
                    disabled={loadingMore}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-800 transition hover:border-blue-400 hover:text-blue-800 disabled:opacity-60"
                  >
                    {loadingMore ? t('home.loadingMore') : t('home.moreNews')}
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </>
          ) : <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">{t('home.emptyLatest')}</p>}
        </section>

        {!loading && rails.map(({ section, stories }) => <SectionRail key={section.slug} section={section} stories={stories} />)}

        <section className="grid gap-6 lg:grid-cols-[1.1fr_1fr_0.9fr]">
          <div>
            <SectionHeading title={t('home.topics')} href="/categories" />
            <div className="grid grid-cols-2 gap-2">
              {SECTIONS.filter((section) => section.slug !== 'trending').map((section) => (
                <Link key={section.slug} to={`/${section.slug}`} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm font-semibold transition hover:border-blue-300 hover:text-blue-800">
                  <span className="truncate">{t(section.labelKey)}</span>
                </Link>
              ))}
            </div>
          </div>
          <div>
            <SectionHeading title={t('home.popular')} href="/articles?sort=popular" />
            {popularStories.slice(0, 4).map((article) => <CompactStory key={article._id} article={article} />)}
            {!popularStories.length && !loading && <p className="text-sm text-slate-500">{t('home.emptyPopular')}</p>}
          </div>
          <aside className="rounded-xl bg-[#082d53] p-5 text-white">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-white/10"><Mail className="h-5 w-5" /></div>
            <h2 className="text-lg font-extrabold">{t('home.newsletterTitle')}</h2>
            <p className="mt-2 text-sm leading-relaxed text-blue-100">{t('home.newsletterDesc')}</p>
            <form className="mt-4 space-y-2" onSubmit={submitNewsletter}>
              <label htmlFor="newsletter-email" className="sr-only">{t('home.newsletterEmail')}</label>
              <input id="newsletter-email" type="email" required value={newsletterEmail} onChange={(event) => setNewsletterEmail(event.target.value)} placeholder={t('home.newsletterPlaceholder')} className="w-full rounded-lg border border-white/20 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-cyan-400" />
              <button
                type="submit"
                disabled={newsletterBusy}
                className="w-full rounded-lg bg-blue-500 px-4 py-2.5 text-sm font-bold transition hover:bg-blue-400 disabled:opacity-60"
              >
                {newsletterBusy ? t('home.newsletterSaving') : t('home.newsletterSave')}
              </button>
            </form>
            {newsletterMessage && <p role="status" className="mt-2 text-xs text-cyan-200">{newsletterMessage}</p>}
            {newsletterError && <p role="alert" className="mt-2 text-xs text-amber-200">{newsletterError}</p>}
            <p className="mt-2 text-[10px] text-blue-200">{t('home.newsletterNote')}</p>
          </aside>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
          <div>
            <SectionHeading title={t('home.mostFollowed')} href={null} />
            {topWriters.length ? (
              <ol className="space-y-2">
                {topWriters.slice(0, 5).map((writer, index) => (
                  <li key={writer._id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                    <span className="w-5 shrink-0 text-sm font-extrabold text-slate-400">{index + 1}</span>
                    <Avatar
                      src={writer.avatar}
                      name={writer.fullName}
                      className="h-10 w-10 shrink-0 bg-blue-100"
                      textClassName="font-bold text-blue-700"
                    />
                    <div className="min-w-0 flex-1">
                      <Link to={`/user/${writer._id}`} className="block truncate text-sm font-bold text-slate-900 hover:text-blue-800">
                        {writer.fullName}
                      </Link>
                      <p className="truncate text-xs text-slate-500">@{writer.username}</p>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-slate-500">
                      {writer.followers} {t(writer.followers === 1 ? 'home.followerOne' : 'home.followerMany')}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              !loading && <p className="text-sm text-slate-500">{t('home.emptyFollowed')}</p>
            )}
          </div>
          <aside className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Users className="h-5 w-5" /></div>
            <h2 className="mt-4 text-lg font-extrabold text-slate-900">{t('home.writersTitle')}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">{t('home.writersDesc')}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link to="/register" className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800">{t('home.writersRegister')}</Link>
              <Link to="/writer/dashboard" className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">{t('home.writersDashboard')}</Link>
            </div>
          </aside>
        </section>

        <NewsAlertsCard />

        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm shadow-sm">
          <span className="inline-flex items-center gap-2 font-semibold text-slate-700"><TrendingUp className="h-4 w-4 text-blue-700" />{t('home.follow')}</span>
          <Link to="/articles" className="inline-flex items-center gap-1 font-bold text-blue-700 hover:text-blue-900">{t('home.browse')}<ArrowRight className="h-4 w-4" /></Link>
        </div>
      </main>
    </div>
  )
}
