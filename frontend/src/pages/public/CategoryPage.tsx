import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import type { Category, Article } from '../../types'
import { publicAPI } from '../../services/api'
import { useI18n } from '../../context/I18nContext'
import ArticleList from '../../components/news/ArticleList'
import { Loading, LoadingGrid } from '../../components/common/Loading'
import EmptyState from '../../components/common/EmptyState'
import Pagination from '../../components/common/Pagination'
import { cn } from '../../utils/cn'
import { useSeo } from '../../utils/useSeo'

export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>()
  const { t } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const [category, setCategory] = useState<Category | null>(null)
  const [articles, setArticles] = useState<Article[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [total, setTotal] = useState(0)

  useSeo({
    title: category?.name,
    description: category?.description,
    path: slug ? `/category/${slug}` : undefined,
  })

  const page = parseInt(searchParams.get('page') || '1')
  const sort = searchParams.get('sort') || 'latest'

  useEffect(() => {
    const fetchData = async () => {
      if (!slug) return
      setIsLoading(true)
      try {
        const articlesRes = await publicAPI.getCategoryArticles(slug, page, 12, sort)
        const payload = articlesRes.data.data as any
        setCategory(payload?.category || null)
        setArticles(payload?.articles || [])
        setTotal(payload?.total || 0)
      } catch (error) {
        console.error('Failed to fetch category data:', error)
        setCategory(null)
        setArticles([])
        setTotal(0)
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [slug, page, sort])

  const handlePageChange = (newPage: number) => {
    setSearchParams({ ...Object.fromEntries(searchParams), page: newPage.toString() })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSortChange = (newSort: string) => {
    setSearchParams({ ...Object.fromEntries(searchParams), sort: newSort, page: '1' })
  }

  const totalPages = Math.ceil(total / 12)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Loading className="h-10 w-48" />
          <Loading className="h-10 w-64" />
        </div>
        <LoadingGrid count={6} />
      </div>
    )
  }

  if (!category) {
    return (
      <div className="text-center py-16">
        <EmptyState
          icon={<svg className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>}
          title={t('category.notFound')}
          description={t('category.notFoundDesc')}
          action={<a href="/categories" className="text-brand-600 hover:underline">{t('category.browse')}</a>}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <nav className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400" aria-label={t('nav.categories')}>
          <Link to="/categories" className="hover:text-brand-600 dark:hover:text-brand-400">{t('nav.categories')}</Link>
          <span aria-hidden="true">/</span>
          <span className="text-gray-900 dark:text-white font-medium">{category.name}</span>
        </nav>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{category.name}</h1>
          {category.description && (
            <p className="text-gray-600 dark:text-gray-400 mt-2">{category.description}</p>
          )}
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            {total} {t('category.count')}
          </p>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {['latest', 'trending', 'popular'].map((sortOption) => (
          <button
            key={sortOption}
            onClick={() => handleSortChange(sortOption)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              sort === sortOption
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            )}
          >
            {t(`articles.${sortOption}`)}
          </button>
        ))}
      </div>

      <ArticleList articles={articles} variant="grid" isLoading={isLoading} emptyMessage={t('category.empty')} />

      {totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
      )}

      <div className="text-center py-12 border-t border-gray-200 dark:border-gray-800 mt-8">
        <Link
          to="/categories"
          className="inline-flex items-center gap-2 text-brand-600 dark:text-brand-400 hover:underline font-medium"
        >
          ← {t('category.back')}
        </Link>
      </div>
    </div>
  )
}