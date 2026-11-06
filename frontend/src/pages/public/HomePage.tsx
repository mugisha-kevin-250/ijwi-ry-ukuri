import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
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
import { publicAPI, articleAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../context/I18nContext'
import NewsBanner from '../../components/news/NewsBanner'
import { cn } from '../../utils/cn'
import { useSeo } from '../../utils/useSeo'
import { requestSignIn } from '../../utils/signInPrompt'

const topics = [
  { name: 'Rwanda', key: 'category.rwanda' },
  { name: 'Politics', key: 'category.politics' },
  { name: 'Business', key: 'category.business' },
  { name: 'Economy', key: 'category.economy' },
  { name: 'Technology', key: 'category.technology' },
  { name: 'Sports', key: 'category.sports' },
  { name: 'Entertainment', key: 'category.entertainment' },
  { name: 'Health', key: 'category.health' },
]

function articleCategory(article: Article) {
  return typeof article.category === 'object' ? article.category : null
}

function ArticleImage({ article, className = '' }: { article: Article; className?: string }) {
  if (article.featuredImage) {
    return <img className={className} src={article.featuredImage} alt="" loading="lazy" />
  }

  return (
    <div className={`${className} flex items-center justify-center bg-gradient-to-br from-blue-900 via-blue-700 to-cyan-500`} aria-hidden="true">
      <span className="rounded-full border border-white/40 px-3 py-1 text-xs font-bold tracking-widest text-white/90">Ijwi ry'ukuri</span>
    </div>
  )
}

function SectionHeading({ title, href = '/articles', action }: { title: string; href?: string; action?: string }) {
  const { t } = useI18n()
  return (
    <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-2">
      <h2 className="text-lg font-extrabold tracking-tight text-slate-900">{title}</h2>
      <Link to={href} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900">
        {action ?? t('articles.viewAll')}<ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  )
}

function StoryCard({ article }: { article: Article }) {
  const { t } = useI18n()
  const category = articleCategory(article)
  const { user } = useAuth()
  const [isFollowing, setIsFollowing] = useState(Boolean(article.followingAuthor))
  const [isLiked, setIsLiked] = useState(Boolean(article.liked))
  const [likeCount, setLikeCount] = useState(article.likes || 0)

  const handleLike = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!user) {
      requestSignIn()
      return
    }
    const next = !isLiked
    setIsLiked(next)
    setLikeCount((prev) => Math.max(0, prev + (next ? 1 : -1)))
    try {
      const response = next ? await articleAPI.likeArticle(article._id) : await articleAPI.unlikeArticle(article._id)
      const likes = (response.data.data as any)?.likes
      if (typeof likes === 'number') setLikeCount(likes)
    } catch (error) {
      setIsLiked(!next)
      setLikeCount((prev) => Math.max(0, prev + (next ? -1 : 1)))
      console.error('Failed to like article:', error)
    }
  }

  const handleShare = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const url = `${window.location.origin}/article/${article.slug}`
    if (navigator.share) {
      try {
        await navigator.share({
          title: article.title,
          text: article.summary,
          url,
        })
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          await navigator.clipboard.writeText(url)
        }
      }
    } else {
      await navigator.clipboard.writeText(url)
    }
  }

  const handleFollow = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!user) {
      requestSignIn()
      return
    }
    const author = typeof article.author === 'object' ? article.author : null
    if (!author) return
    const next = !isFollowing
    setIsFollowing(next)
    try {
      if (next) await articleAPI.followWriter(author._id)
      else await articleAPI.unfollowWriter(author._id)
    } catch (error) {
      setIsFollowing(!next)
      console.error('Failed to follow/unfollow author:', error)
    }
  }

  return (
    <article className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <Link to={`/article/${article.slug}`} className="block overflow-hidden">
        <ArticleImage article={article} className="aspect-[16/10] w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
      </Link>
      <div className="p-4">
        {category && <Link to={`/category/${category.slug}`} className="text-[10px] font-bold uppercase tracking-wider text-blue-700 hover:text-blue-900">{category.name}</Link>}
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
                className={cn(
                  'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                  isFollowing
                    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                )}
              >
                <UserPlus className="h-3.5 w-3.5" />
                {isFollowing ? t('articles.following') : t('articles.follow')}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleLike}
                aria-pressed={isLiked}
                className={cn(
                  'inline-flex items-center gap-1 text-sm transition-colors',
                  isLiked ? 'text-red-500 font-semibold' : 'text-slate-500 hover:text-red-500'
                )}
                title={t('writer.likes')}
              >
                <Heart className={cn('h-4 w-4', isLiked && 'fill-current')} />
                <span>{likeCount.toLocaleString()}</span>
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
        <span className="mt-1 block text-[10px] text-slate-400">{article.readingTime || 3} {t('articles.minRead')}</span>
      </span>
    </Link>
  )
}

export default function HomePage() {
  const { t } = useI18n()
  useSeo({ path: '/' })
  const [searchParams] = useSearchParams()
  const [latest, setLatest] = useState<Article[]>([])
  const [trending, setTrending] = useState<Article[]>([])
  const [popular, setPopular] = useState<Article[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [newsletterEmail, setNewsletterEmail] = useState('')
  const [newsletterMessage, setNewsletterMessage] = useState('')

  const search = searchParams.get('search') || ''

  const loadNews = async () => {
    setLoading(true)
    setLoadError('')
    const results = await Promise.allSettled([
      publicAPI.getArticles({ page: 1, limit: 24, sort: 'latest' }),
      publicAPI.getTrending(),
      publicAPI.getPopular(),
      publicAPI.getCategories(),
    ])

    const [latestResult, trendingResult, popularResult, categoriesResult] = results
    let failed = false
    if (latestResult.status === 'fulfilled') {
      const data = latestResult.value.data.data as any
      if (Array.isArray(data)) {
        setLatest(data)
      } else if (data && Array.isArray(data.articles)) {
        setLatest(data.articles)
      } else {
        setLatest([])
      }
    }
    else failed = true
    if (trendingResult.status === 'fulfilled') {
      const data = trendingResult.value.data.data as any
      if (Array.isArray(data)) {
        setTrending(data)
      } else if (data && Array.isArray(data.articles)) {
        setTrending(data.articles)
      } else {
        setTrending([])
      }
    }
    else failed = true
    if (popularResult.status === 'fulfilled') {
      const data = popularResult.value.data.data as any
      if (Array.isArray(data)) {
        setPopular(data)
      } else if (data && Array.isArray(data.articles)) {
        setPopular(data.articles)
      } else {
        setPopular([])
      }
    }
    else failed = true
    if (categoriesResult.status === 'fulfilled') {
      const data = categoriesResult.value.data.data as any
      if (Array.isArray(data)) {
        setCategories(data)
      } else if (data && Array.isArray(data.categories)) {
        setCategories(data.categories)
      } else {
        setCategories([])
      }
    }
    else failed = true

    if (failed) setLoadError(t('home.loadError'))
    setLoading(false)
  }

  useEffect(() => {
    void loadNews()
  }, [])

  const handleNewsletterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const saved = JSON.parse(localStorage.getItem('ijwiryukuri-newsletter') || '[]') as string[]
    if (!saved.includes(newsletterEmail.trim().toLowerCase())) {
      localStorage.setItem('ijwiryukuri-newsletter', JSON.stringify([...saved, newsletterEmail.trim().toLowerCase()]))
    }
    setNewsletterMessage(t('home.emailSaved'))
    setNewsletterEmail('')
  }

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget as HTMLFormElement)
    const searchValue = formData.get('search') as string
    const params = new URLSearchParams()
    if (searchValue) {
      params.set('search', searchValue)
    }
    window.location.href = `/articles?${params.toString()}`
  }

  const featured = latest[0]
  const sideStories = trending.filter((article) => article._id !== featured?._id).slice(0, 4)
  const latestGrid = latest.filter((article) => article._id !== featured?._id).slice(0, 6)
  const popularStories = popular.length ? popular : trending

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <nav className="bg-[var(--color-brand)] text-white" aria-label={t('nav.articles')}>
        <div className="mx-auto flex max-w-7xl items-center gap-6 overflow-x-auto px-4 py-2.5 text-xs font-semibold sm:px-6 lg:px-8">
          {topics.map((topic) => {
            const category = categories.find((item) => item.name.toLowerCase() === topic.name.toLowerCase())
            return <Link key={topic.key} to={category ? `/category/${category.slug}` : '/categories'} className="shrink-0 transition hover:text-[var(--color-brand-light)]">{t(topic.key)}</Link>
          })}
          <Link to="/categories" className="shrink-0 text-[var(--color-brand-light)]">{t('category.other')} +</Link>
        </div>
      </nav>

      <div className="bg-red-600 text-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 text-xs sm:px-6 lg:px-8">
          <span className="shrink-0 rounded bg-white px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-red-600">{t('home.breaking')}</span>
          <p className="truncate font-medium">{trending[0]?.title || t('home.breakingFallback')}</p>
          {trending[0] && <Link to={`/article/${trending[0].slug}`} className="ml-auto shrink-0 text-white/80 hover:text-white" aria-label={t('home.readBreaking')}><ArrowRight className="h-4 w-4" /></Link>}
        </div>
      </div>

      {/* Mobile Search Bar */}
      <div className="md:hidden px-4 py-3 bg-[var(--color-bg)] border-b border-[var(--color-border)]">
        <form onSubmit={handleSearch} className="relative">
          <input
            type="search"
            name="search"
            defaultValue={search}
            placeholder={t('search.placeholder')}
            className="input-field pl-10"
            aria-label={t('nav.search')}
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </form>
      </div>

      <main className="mx-auto max-w-7xl space-y-9 px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
        {loadError && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span>{loadError}</span>
            <button type="button" onClick={() => void loadNews()} className="font-bold underline">{t('home.retry')}</button>
          </div>
        )}

<section className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(280px,0.9fr)]">
          <div>
            <SectionHeading title={t('home.top')} />
            {loading ? <div className="aspect-[16/8] animate-pulse rounded-xl bg-slate-200" /> : featured ? (
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
          {loading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="h-64 animate-pulse rounded-xl bg-slate-200" />)}</div> : latestGrid.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{latestGrid.map((article) => <StoryCard key={article._id} article={article} />)}</div>
          ) : <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">{t('home.emptyLatest')}</p>}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_1fr_0.9fr]">
          <div>
            <SectionHeading title={t('home.topics')} href="/categories" />
            <div className="grid grid-cols-2 gap-2">
              {categories.slice(0, 8).map((category) => (
                <Link key={category._id} to={`/category/${category.slug}`} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm font-semibold transition hover:border-blue-300 hover:text-blue-800">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Bookmark className="h-4 w-4" /></span>
                  <span className="truncate">{category.name}</span>
                </Link>
              ))}
              {!categories.length && !loading && <p className="col-span-2 text-sm text-slate-500">{t('home.emptyCategories')}</p>}
            </div>
          </div>
          <div>
            <SectionHeading title={t('home.mostFollowed')} href="/articles?sort=popular" />
            {popularStories.slice(0, 3).map((article) => <CompactStory key={article._id} article={article} />)}
            {!popularStories.length && !loading && <p className="text-sm text-slate-500">{t('home.emptyFollowed')}</p>}
          </div>
          <aside className="rounded-xl bg-[#082d53] p-5 text-white">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-white/10"><Mail className="h-5 w-5" /></div>
            <h2 className="text-lg font-extrabold">{t('home.newsletterTitle')}</h2>
            <p className="mt-2 text-sm leading-relaxed text-blue-100">{t('home.newsletterDesc')}</p>
            <form className="mt-4 space-y-2" onSubmit={handleNewsletterSubmit}>
              <label htmlFor="newsletter-email" className="sr-only">{t('home.newsletterEmail')}</label>
              <input id="newsletter-email" type="email" required value={newsletterEmail} onChange={(event) => setNewsletterEmail(event.target.value)} placeholder={t('home.newsletterPlaceholder')} className="w-full rounded-lg border border-white/20 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-cyan-400" />
              <button className="w-full rounded-lg bg-blue-500 px-4 py-2.5 text-sm font-bold transition hover:bg-blue-400">{t('home.newsletterSave')}</button>
            </form>
            {newsletterMessage && <p role="status" className="mt-2 text-xs text-cyan-200">{newsletterMessage}</p>}
            <p className="mt-2 text-[10px] text-blue-200">{t('home.newsletterNote')}</p>
          </aside>
        </section>

        <section className="overflow-hidden rounded-2xl bg-gradient-to-r from-[#062b52] to-blue-700 text-white">
          <div className="flex flex-col items-start justify-between gap-5 p-6 sm:flex-row sm:items-center sm:p-8">
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">{t('home.heroEyebrow')}</span>
              <h2 className="mt-2 text-2xl font-extrabold sm:text-3xl">{t('home.heroTitle')}</h2>
              <p className="mt-2 max-w-xl text-sm text-blue-100">{t('home.heroDesc')}</p>
            </div>
            <Link to="/articles" className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-blue-900 transition hover:bg-blue-50">{t('home.heroBrowse')}<ArrowUpRight className="h-4 w-4" /></Link>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
          <div>
            <SectionHeading title={t('home.popular')} href="/articles?sort=popular" />
            {popularStories.slice(0, 4).map((article, index) => <CompactStory key={article._id} article={article} index={index} />)}
            {!popularStories.length && !loading && <p className="text-sm text-slate-500">{t('home.emptyPopular')}</p>}
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

        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm shadow-sm">
          <span className="inline-flex items-center gap-2 font-semibold text-slate-700"><TrendingUp className="h-4 w-4 text-blue-700" />{t('home.follow')}</span>
          <Link to="/articles" className="inline-flex items-center gap-1 font-bold text-blue-700 hover:text-blue-900">{t('home.browse')}<ArrowRight className="h-4 w-4" /></Link>
        </div>
      </main>

      <footer className="bg-[#062b52] text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-7 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-15">
          <div><Link to="/" className="text-lg font-black tracking-tight">Ijwi ry<span className="text-cyan-300">'ukuri</span></Link><p className="mt-1 text-xs text-blue-200">{t('home.mission')}</p></div>
          <div className="flex flex-wrap gap-4 text-xs text-blue-100"><Link to="/about" className="hover:text-white">{t('footer.about')}</Link><Link to="/articles" className="hover:text-white">{t('footer.news')}</Link><Link to="/categories" className="hover:text-white">{t('footer.categories')}</Link><Link to="/register" className="hover:text-white">{t('footer.write')}</Link></div>
          <p className="text-xs text-blue-200">© {new Date().getFullYear()} Ijwi ry'ukuri</p>
        </div>
      </footer>
    </div>
  )
}
