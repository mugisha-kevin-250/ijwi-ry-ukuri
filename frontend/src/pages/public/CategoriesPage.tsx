import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Category } from '../../types'
import { publicAPI } from '../../services/api'
import { useI18n } from '../../context/I18nContext'
import { resolveCategories, type ResolvedCategory } from '../../data/categoryVisuals'
import CategoryCard from '../../components/news/CategoryCard'
import { Loading } from '../../components/common/Loading'
import EmptyState from '../../components/common/EmptyState'

export default function CategoriesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [resolved, setResolved] = useState<ResolvedCategory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { t } = useI18n()

  const search = searchParams.get('search') || ''

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await publicAPI.getCategories()
        const categoryList = (response.data.data as any)?.categories ?? response.data.data ?? []
        setResolved(resolveCategories(Array.isArray(categoryList) ? categoryList as Category[] : []))
      } catch (error) {
        console.error('Failed to fetch categories:', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchCategories()
  }, [])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return resolved
    return resolved.filter(({ category }) =>
      category.name.toLowerCase().includes(term) ||
      category.slug.toLowerCase().includes(term) ||
      (category.description || '').toLowerCase().includes(term)
    )
  }, [resolved, search])

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
    setSearchParams(params)
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <Loading className="h-10 w-48 mx-auto" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      <div className="text-center">
        <h1 className="text-3xl font-extrabold text-[var(--color-text)] sm:text-4xl">{t('categories.title')}</h1>
        <p className="mx-auto mt-3 max-w-2xl text-[var(--color-text-muted)]">{t('categories.subtitle')}</p>
      </div>

      <form onSubmit={handleSearch} className="relative mx-auto max-w-md">
        <label htmlFor="category-search" className="sr-only">{t('categories.searchPlaceholder')}</label>
        <input
          id="category-search"
          type="search"
          name="search"
          defaultValue={search}
          placeholder={t('categories.searchPlaceholder')}
          className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-11 pr-4 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-800"
        />
        <svg className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </form>

      {visible.length === 0 ? (
        <EmptyState
          icon={<svg className="mx-auto mb-4 h-12 w-12 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>}
          title={resolved.length === 0 ? t('categories.emptyTitle') : t('categories.noResults')}
          description={resolved.length === 0 ? t('categories.emptyDesc') : t('categories.helpDesc')}
        />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map(({ category, visual }) => (
            <CategoryCard
              key={category._id}
              category={category}
              label={visual.labelKey ? t(visual.labelKey) : category.name}
              image={visual.image}
            />
          ))}
        </div>
      )}

      <div className="mt-8 border-t border-[var(--color-border)] pt-12 text-center">
        <h2 className="text-2xl font-bold text-[var(--color-text)]">{t('categories.helpTitle')}</h2>
        <p className="mx-auto mt-3 max-w-2xl text-[var(--color-text-muted)]">{t('categories.helpDesc')}</p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link to="/articles" className="btn-primary">{t('categories.browseAll')}</Link>
          <Link to="/search" className="btn-outline">{t('categories.searchCta')}</Link>
        </div>
      </div>
    </div>
  )
}
