import React, { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Article, Category } from '../../types'
import { publicAPI } from '../../services/api'
import { Loading, LoadingGrid } from '../../components/common/Loading'
import Pagination from '../../components/common/Pagination'
import { cn } from '../../utils/cn'
import { useSeo } from '../../utils/useSeo'
import { useArticleLike, useAuthorFollow } from '../../utils/engagementStore'
import { useI18n } from '../../context/I18nContext'
import { Eye, Heart, Share2, UserPlus, BookOpen, Clock3 } from 'lucide-react'
import MediaImage from '../../components/common/MediaImage'
import { PLACEHOLDER_IMAGE } from '../../services/apiClient'
import { shareArticle } from '../../utils/shareArticle'

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
        {category && <Link to={`/category/${category.slug}`} className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-brand-text)] hover:text-[var(--color-brand-hover)]">{category.name}</Link>}
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
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
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

          {categories.length > 0 && (
            <div
              className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:max-w-[60%] lg:flex-1 lg:justify-end"
              role="group"
              aria-label={t('articles.categories')}
            >
              <ChipButton label={t('articles.allCategories')} active={!category} onClick={() => handleCategoryChange('')} />
              {(showAllCategories ? categories : categories.slice(0, 4)).map((cat) => (
                <ChipButton
                  key={cat._id}
                  label={cat.name}
                  active={category === cat.slug}
                  onClick={() => handleCategoryChange(cat.slug)}
                />
              ))}
              {categories.length > 4 && (
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

      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {articles.map((article) => (
          <StoryCard key={article._id} article={article} />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="mt-8">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={handlePageChange}
          />
        </div>
      )}
    </div>
  )
}