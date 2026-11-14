import React, { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Article, Category } from '../../types'
import { publicAPI } from '../../services/api'
import { Loading, LoadingGrid } from '../../components/common/Loading'
import Pagination from '../../components/common/Pagination'
import { cn } from '../../utils/cn'
import { useSeo } from '../../utils/useSeo'
import { categoryHref, categoryLabel, resolveCategories } from '../../data/categoryVisuals'
import { useArticleLike, useAuthorFollow } from '../../utils/engagementStore'
import { useI18n } from '../../context/I18nContext'
import { Eye, Heart, Share2, UserPlus, BookOpen, Clock3 } from 'lucide-react'
import MediaImage from '../../components/common/MediaImage'
import { PLACEHOLDER_IMAGE } from '../../services/apiClient'
import { shareArticle } from '../../utils/shareArticle'
import AdSlot from '../../components/ads/AdSlot'

function ChipButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm',
        active
          ? 'bg-[var(--color-brand)] text-white shadow-sm'
          : 'bg-[var(--color-brand-light)] text-[var(--color-brand-text)] hover:bg-[var(--color-brand-hover)]',
      )}
    >
      {label}
    </button>
  )
}

function StoryCard({ article }: { article: Article }) {
  const { t } = useI18n()
  const category = typeof article.category === 'object' ? article.category : null
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
    <article className="group overflow-hidden rounded-xl border border-[var(--color-border)] bg-white dark:bg-[var(--color-bg)] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <Link to={`/article/${article.slug}`} className="block overflow-hidden">
        <MediaImage
          src={article.featuredImage || PLACEHOLDER_IMAGE}
          alt={article.title}
          className="aspect-[16/10] w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          loading="lazy"
        />
      </Link>
      <div className="p-4">
        {category && (
          <Link
            to={categoryHref(category)}
            className="inline-flex items-center rounded-full bg-[var(--color-brand-light)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-brand-text)] transition hover:text-[var(--color-brand-hover)]"
          >
            {categoryLabel(category, t)}
          </Link>
        )}
        <Link to={`/article/${article.slug}`}>
          <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-snug text-[var(--color-text)] group-hover:text-[var(--color-brand-text)]">{article.title}</h3>
        </Link>
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[var(--color-text-muted)]">{article.summary}</p>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-3 text-[10px] text-[var(--color-text-muted)]">
            <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{article.readingTime || 3} {t('articles.minRead')}</span>
            <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" />{(article.views || 0).toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1">
            <Link to={`/article/${article.slug}`} className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium text-[var(--color-brand-text)] hover:text-[var(--color-brand-hover)]">
              <BookOpen className="h-4 w-4" />
              {t('articles.readStory')}
            </Link>
          </div>
        </div>
        {author && (
          <div className="mt-3 flex items-center justify-between pt-3 border-t border-[var(--color-border)]">
            <div className="flex items-center gap-2">
              <button
                onClick={handleFollow}
                aria-pressed={following}
                className={cn(
                  'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                  following
                    ? 'bg-[var(--color-brand-light)] text-[var(--color-brand-text)]'
                    : 'bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)]'
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
                  liked ? 'text-[var(--color-brand-text)] font-semibold' : 'text-[var(--color-text-muted)] hover:text-[var(--color-brand-text)]'
                )}
                title={t('writer.likes')}
              >
                <Heart className={cn('h-4 w-4', liked && 'fill-current')} />
                <span>{likes.toLocaleString()}</span>
              </button>
              <button
                onClick={handleShare}
                className="inline-flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-brand-text)] transition-colors"
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

function LeadStory({ article }: { article: Article }) {
  const { t, lang } = useI18n()
  const category = typeof article.category === 'object' ? article.category : null
  const author = typeof article.author === 'object' ? article.author : null
  const published = article.publishedAt || article.createdAt ? new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(new Date(article.publishedAt || article.createdAt)) : t('articles.unknownDate')

  return (
    <article className="group overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-sm transition hover:shadow-md dark:bg-[var(--color-bg)]">
      <Link to={`/article/${article.slug}`} className="block overflow-hidden">
        <MediaImage
          src={article.featuredImage || PLACEHOLDER_IMAGE}
          alt={article.title}
          className="aspect-[16/9] w-full object-cover transition duration-500 group-hover:scale-[1.015]"
          // The lead picture is the largest thing on the page and it is here
          // before the reader scrolls, so it is fetched at once.
          loading="eager"
        />
      </Link>
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
          {category && (
            <Link
              to={categoryHref(category)}
              className="rounded-full bg-[var(--color-brand-light)] px-2 py-0.5 font-bold uppercase tracking-wider text-[var(--color-brand-text)] transition hover:text-[var(--color-brand-hover)]"
            >
              {categoryLabel(category, t)}
            </Link>
          )}
          <span>{published}</span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <Clock3 className="h-3 w-3" />
            {article.readingTime || 3} {t('articles.minRead')}
          </span>
        </div>
        <Link to={`/article/${article.slug}`}>
          <h2 className="mt-2 text-xl font-extrabold leading-tight tracking-tight text-[var(--color-text)] group-hover:text-[var(--color-brand-text)] sm:text-2xl lg:text-[28px]">
            {article.title}
          </h2>
        </Link>
        <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-[var(--color-text-muted)] sm:text-base">{article.summary}</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--color-text-muted)]">
          {author && (
            <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--color-text)]">
              {author.fullName || author.username}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" />
            {(article.views || 0).toLocaleString()} {t('articles.views')}
          </span>
          <span className="inline-flex items-center gap-1">
            <Heart className="h-3.5 w-3.5" />
            {(article.likes || 0).toLocaleString()}
          </span>
        </div>
      </div>
    </article>
  )
}

// Everything after the first page fold is read, not browsed for a picture: one
// line of headline, one small thumbnail, and the reader keeps going.
function StoryRow({ article }: { article: Article }) {
  const { t, lang } = useI18n()
  const category = typeof article.category === 'object' ? article.category : null
  const published = article.publishedAt || article.createdAt ? new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(new Date(article.publishedAt || article.createdAt)) : t('articles.unknownDate')

  return (
    <article className="group flex gap-4 border-b border-[var(--color-border)] py-4 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
          {category && (
            <Link to={categoryHref(category)} className="font-bold uppercase tracking-wider text-[var(--color-brand-text)] hover:underline">
              {categoryLabel(category, t)}
            </Link>
          )}
          <span>{published}</span>
          <span aria-hidden="true">·</span>
          <span>
            {article.readingTime || 3} {t('articles.minRead')}
          </span>
        </p>
        <Link to={`/article/${article.slug}`}>
          <h3 className="mt-1 text-base font-bold leading-snug text-[var(--color-text)] group-hover:text-[var(--color-brand-text)] sm:text-lg">
            {article.title}
          </h3>
        </Link>
        <p className="mt-1.5 line-clamp-2 max-w-[70ch] text-sm leading-relaxed text-[var(--color-text-muted)]">{article.summary}</p>
      </div>
      <Link to={`/article/${article.slug}`} className="w-24 shrink-0 overflow-hidden rounded-lg sm:w-32">
        <MediaImage
          src={article.featuredImage || PLACEHOLDER_IMAGE}
          alt={article.title}
          className="aspect-[4/3] w-full object-cover transition duration-300 group-hover:scale-[1.04]"
          loading="lazy"
        />
      </Link>
    </article>
  )
}

export default function ArticleListPage() {
  const { t } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const [articles, setArticles] = useState<Article[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [showAllCategories, setShowAllCategories] = useState(false)

  useSeo({ title: t('nav.articles'), path: '/articles' })

  const page = parseInt(searchParams.get('page') || '1')
  const search = searchParams.get('search') || ''
  const category = searchParams.get('category') || ''
  const sort = searchParams.get('sort') || 'latest'
  // One chip per section, even though the database keeps the same section under
  // two spellings ("Sports" and "Amasport").
  const sections = useMemo(() => resolveCategories(categories), [categories])

  useEffect(() => {
    const fetchArticles = async () => {
      setIsLoading(true)
      try {
        const params: Record<string, string | number> = { page, limit: 12 }
        if (search) params.search = search
        if (category) params.category = category
        if (sort) params.sort = sort

        const response = await publicAPI.getArticles(params)
        setArticles(response.data.data?.articles || [])
        setTotal(response.data.data?.total || 0)
      } catch (error) {
        console.error('Failed to fetch articles:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchArticles()
  }, [page, search, category, sort])

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await publicAPI.getCategories()
        setCategories((response.data.data as any)?.categories || [])
      } catch (error) {
        console.error('Failed to fetch categories:', error)
      }
    }
    fetchCategories()
  }, [])

  const handlePageChange = (newPage: number) => {
    setSearchParams({ ...Object.fromEntries(searchParams), page: newPage.toString() })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSortChange = (newSort: string) => {
    setSearchParams({ ...Object.fromEntries(searchParams), sort: newSort, page: '1' })
  }

  const handleCategoryChange = (newCategory: string) => {
    const params = Object.fromEntries(searchParams)
    if (newCategory) {
      params.category = newCategory
    } else {
      delete params.category
    }
    params.page = '1'
    setSearchParams(params)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget as HTMLFormElement)
    const searchValue = formData.get('search') as string
    const params = Object.fromEntries(searchParams)
    if (searchValue) {
      params.search = searchValue
    } else {
      delete params.search
    }
    params.page = '1'
    setSearchParams(params)
  }

  const totalPages = Math.ceil(total / 12)

  // A newsroom reads top-down, not as a wall of equal tiles: one lead story,
  // the two or three that matter next, then the running order.
  const lead = articles[0]
  const secondary = articles.slice(1, 5)
  const rest = articles.slice(5)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex gap-4">
          <Loading className="h-10 w-64" />
          <Loading className="h-10 w-64" />
        </div>
        <LoadingGrid count={6} />
      </div>
    )
  }

  return (
    <div className="mx-auto min-h-screen max-w-7xl px-4 pb-4 text-[var(--color-text)] sm:px-6 lg:px-8">
      <section className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm dark:bg-[var(--color-surface,#0b1220)] sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold tracking-tight text-[var(--color-text)] sm:text-3xl">{t('articles.title')}</h1>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              {total} {t('articles.found')}
            </p>
          </div>
          <form onSubmit={handleSearch} className="relative w-full sm:w-72">
            <input
              type="search"
              name="search"
              defaultValue={search}
              placeholder={t('articles.search')}
              className="input-field pl-10"
              aria-label={t('articles.search')}
            />
            <svg className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </form>
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-[var(--color-border)] pt-4 lg:flex-row lg:items-center lg:justify-between">
          <div
            className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-brand-light)] p-1"
            role="group"
            aria-label={t('articles.sortBy')}
          >
            {['latest', 'trending', 'popular'].map((sortOption) => (
              <button
                key={sortOption}
                onClick={() => handleSortChange(sortOption)}
                aria-pressed={sort === sortOption}
                className={cn(
                  'whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm',
                  sort === sortOption
                    ? 'bg-[var(--color-brand)] text-white shadow-sm'
                    : 'text-[var(--color-brand-text)] hover:bg-white/70',
                )}
              >
                {t(`articles.${sortOption}`)}
              </button>
            ))}
          </div>

          {sections.length > 0 && (
            <div
              className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:max-w-[60%] lg:flex-1 lg:justify-end"
              role="group"
              aria-label={t('articles.categories')}
            >
              <ChipButton label={t('articles.allCategories')} active={!category} onClick={() => handleCategoryChange('')} />
              {(showAllCategories ? sections : sections.slice(0, 4)).map(({ category: section }) => (
                <ChipButton
                  key={section._id}
                  label={categoryLabel(section, t)}
                  active={category === section.slug}
                  onClick={() => handleCategoryChange(section.slug)}
                />
              ))}
              {sections.length > 4 && (
                <button
                  onClick={() => setShowAllCategories((current) => !current)}
                  className="shrink-0 whitespace-nowrap px-2 py-1.5 text-xs font-semibold text-[var(--color-brand-text)] transition-colors hover:underline sm:text-sm"
                >
                  {showAllCategories ? t('articles.showLess') : t('articles.exploreMore')}
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      <div className="mt-6 grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_auto_auto]">
        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-1">
          {lead ? (
            <LeadStory article={lead} />
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-8 text-center dark:bg-[var(--color-bg)]">
              <p className="text-sm font-semibold text-[var(--color-text)]">{t('articles.empty')}</p>
              {(search || category) && (
                <button
                  onClick={() => {
                    const params = Object.fromEntries(searchParams)
                    delete params.search
                    delete params.category
                    params.page = '1'
                    setSearchParams(params)
                  }}
                  className="mt-3 rounded-full bg-[var(--color-brand)] px-4 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[var(--color-brand-hover)]"
                >
                  {t('articles.clearFilters')}
                </button>
              )}
            </div>
          )}

          {secondary.length > 0 && (
            <div className="grid gap-5 sm:grid-cols-2">
              {secondary.map((article) => (
                <StoryCard key={article._id} article={article} />
              ))}
            </div>
          )}
        </div>

        {/* The space a newsroom sells. It holds the top of the page while the
            stories scroll past it, so it stays visible without following the
            reader down to the bottom. */}
        <aside className="lg:col-start-2 lg:row-start-1 lg:row-end-4">
          <div className="space-y-6 lg:sticky lg:top-[104px]">
            <AdSlot name="newsRail" />
            {sections.length > 0 && (
              <nav
                aria-label={t('articles.categories')}
                className="hidden rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm lg:block dark:bg-[var(--color-bg)]"
              >
                <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                  {t('articles.browseSections')}
                </h2>
                <ul className="mt-2 space-y-1">
                  {sections.map(({ category: section }) => (
                    <li key={section._id}>
                      <Link
                        to={categoryHref(section)}
                        className={cn(
                          'block rounded-lg px-2 py-1.5 text-sm font-semibold transition-colors hover:bg-[var(--color-brand-light)] hover:text-[var(--color-brand-text)]',
                          category === section.slug
                            ? 'bg-[var(--color-brand-light)] text-[var(--color-brand-text)]'
                            : 'text-[var(--color-text)]',
                        )}
                      >
                        {categoryLabel(section, t)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </div>
        </aside>

        {rest.length > 0 && (
          <section className="min-w-0 lg:col-start-1 lg:row-start-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
              {t('articles.moreNews')}
            </h2>
            <div className="mt-2 rounded-2xl border border-[var(--color-border)] bg-white px-4 shadow-sm sm:px-5 dark:bg-[var(--color-bg)]">
              {rest.map((article) => (
                <StoryRow key={article._id} article={article} />
              ))}
            </div>
            <AdSlot name="list" className="mt-8" />
          </section>
        )}

        {totalPages > 1 && (
          <div className="lg:col-start-1 lg:row-start-3">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={handlePageChange}
            />
          </div>
        )}
      </div>
    </div>
  )
}