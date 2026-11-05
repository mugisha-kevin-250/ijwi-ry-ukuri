import React, { useEffect, useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import type { Article, Category } from '../../types'
import { publicAPI } from '../../services/api'
import { Loading, LoadingGrid } from '../../components/common/Loading'
import Pagination from '../../components/common/Pagination'
import { cn } from '../../utils/cn'
import { useSeo } from '../../utils/useSeo'
import { useAuth } from '../../context/AuthContext'
import { articleAPI } from '../../services/api'
import { useI18n } from '../../context/I18nContext'
import { Eye, Heart, Share2, UserPlus, BookOpen, Clock3 } from 'lucide-react'

function StoryCard({ article }: { article: Article }) {
  const { t } = useI18n()
  const category = typeof article.category === 'object' ? article.category : null
  const author = typeof article.author === 'object' ? article.author : null
  const { user } = useAuth()
  const navigate = useNavigate()
  const [isFollowing, setIsFollowing] = useState(false)
  const [isLiked, setIsLiked] = useState(false)

  useEffect(() => {
    if (user && article.author) {
      const authorId = typeof article.author === 'object' ? article.author._id : article.author
      articleAPI.checkFollowStatus(authorId).then(res => setIsFollowing(res.data.data.isFollowing)).catch(() => {})
    }
  }, [user, article])

  const handleLike = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!user) {
      navigate('/login')
      return
    }
    try {
      if (isLiked) {
        await articleAPI.unlikeArticle(article._id)
        setIsLiked(false)
      } else {
        await articleAPI.likeArticle(article._id)
        setIsLiked(true)
      }
    } catch (error) {
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
      navigate('/login')
      return
    }
    const author = typeof article.author === 'object' ? article.author : null
    if (!author) return
    try {
      if (isFollowing) {
        await articleAPI.unfollowWriter(author._id)
        setIsFollowing(false)
      } else {
        await articleAPI.followWriter(author._id)
        setIsFollowing(true)
      }
    } catch (error) {
      console.error('Failed to follow/unfollow author:', error)
    }
  }

  return (
    <article className="group overflow-hidden rounded-xl border border-[var(--color-border)] bg-white dark:bg-[var(--color-bg)] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <Link to={`/article/${article.slug}`} className="block overflow-hidden">
        <img
          src={article.featuredImage || '/placeholder-article.jpg'}
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
                className={cn(
                  'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                  isFollowing
                    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
                    : 'bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)]'
                )}
              >
                <UserPlus className="h-3.5 w-3.5" />
                {isFollowing ? t('articles.following') : t('articles.follow')}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleLike}
                className="inline-flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-red-500 transition-colors"
                title={t('writer.likes')}
              >
                <Heart className="h-4 w-4" />
                <span>{(article.likes || 0).toLocaleString()}</span>
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
      <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text)]">{t('articles.title')}</h1>
          <p className="text-[var(--color-text-muted)] mt-1">
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
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </form>
      </div>

      <div className="flex flex-wrap gap-2">
        {['latest', 'trending', 'popular'].map((sortOption) => (
          <button
            key={sortOption}
            onClick={() => handleSortChange(sortOption)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              sort === sortOption
                ? 'bg-[var(--color-brand)] text-white'
                : 'bg-[var(--color-brand-light)] dark:bg-[var(--color-brand-light)] text-[var(--color-brand-text)] hover:bg-[var(--color-brand-hover)]'
            )}
          >
            {t(`articles.${sortOption}`)}
          </button>
        ))}
      </div>

      {totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
      )}

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleCategoryChange('')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              !category
                ? 'bg-[var(--color-brand)] text-white'
                : 'bg-[var(--color-brand-light)] dark:bg-[var(--color-brand-light)] text-[var(--color-brand-text)] hover:bg-[var(--color-brand-hover)]'
            )}
          >
            {t('articles.allCategories')}
          </button>
          {showAllCategories ? (
            <>
              {categories.map((cat) => (
                <button
                  key={cat._id}
                  onClick={() => handleCategoryChange(cat.slug)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                    category === cat.slug
                      ? 'bg-[var(--color-brand)] text-white'
                      : 'bg-[var(--color-brand-light)] dark:bg-[var(--color-brand-light)] text-[var(--color-brand-text)] hover:bg-[var(--color-brand-hover)]'
                  )}
                >
                  {cat.name}
                </button>
              ))}
              <button
                onClick={() => setShowAllCategories(false)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--color-brand-text)] hover:bg-[var(--color-brand-light)] transition-colors"
              >
                {t('articles.showLess')}
              </button>
            </>
          ) : (
            <>
              {categories.slice(0, 4).map((cat) => (
                <button
                  key={cat._id}
                  onClick={() => handleCategoryChange(cat.slug)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                    category === cat.slug
                      ? 'bg-[var(--color-brand)] text-white'
                      : 'bg-[var(--color-brand-light)] dark:bg-[var(--color-brand-light)] text-[var(--color-brand-text)] hover:bg-[var(--color-brand-hover)]'
                  )}
                >
                  {cat.name}
                </button>
              ))}
              {categories.length > 4 && (
                <button
                  onClick={() => setShowAllCategories(true)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--color-brand-text)] hover:bg-[var(--color-brand-light)] transition-colors"
                >
                  {t('articles.exploreMore')}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
      )}

      <div className={cn('grid gap-6', {
        'grid-cols-1': true,
        'sm:grid-cols-2': true,
        'lg:grid-cols-3': true,
        'xl:grid-cols-4': true,
      })}>
        {articles.map((article) => (
          <StoryCard key={article._id} article={article} />
        ))}
      </div>
    </div>
    </div>
  )
}