import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Category } from '../../types'
import { publicAPI } from '../../services/api'
import { useI18n } from '../../context/I18nContext'
import { categoryImage, categoryLabel, resolveCategories, type ResolvedCategory } from '../../data/categoryVisuals'
import { SECTIONS, sectionHrefFor } from '../../data/sections'
import CategoryCard from '../../components/news/CategoryCard'
import { SkeletonCards } from '../../components/common/Skeleton'
import EmptyState from '../../components/common/EmptyState'
import { useSeo } from '../../utils/useSeo'

export default function CategoriesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [resolved, setResolved] = useState<ResolvedCategory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { t } = useI18n()
  useSeo({ title: t('nav.categories'), path: '/categories' })

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

  const term = search.trim().toLowerCase()

  // The published sections come from the site's own structure, so this page
  // paints them without waiting for the server.
  const visibleSections = useMemo(() => {
    if (!term) return SECTIONS
    return SECTIONS.filter((section) => {
      const words = [t(section.labelKey), section.slug, ...section.aliases,
        ...section.children.map((child) => `${t(child.labelKey)} ${child.slug}`)]
      return words.some((value) => value.toLowerCase().includes(term))
    })
  }, [term, t])

  const visibleSubsections = useMemo(() => SECTIONS.flatMap((section) =>
    section.children.map((child) => ({ section, child }))
  ).filter(({ section, child }) => {
    if (!term) return true
    const words = [t(child.labelKey), child.slug, ...child.aliases, t(section.labelKey)]
    return words.some((value) => value.toLowerCase().includes(term))
  }), [term, t])

  // Anything the section tree does not publish — a topic an admin made up
  // themselves — still gets a card here, on its long-standing /category page.
  const visibleTopics = useMemo(() => {
    const outsideTree = resolved.filter(({ category }) => !sectionHrefFor(category))
    if (!term) return outsideTree
    return outsideTree.filter(({ category }) => {
      const names = [categoryLabel(category, t), category.name, category.slug]
      return names.some((value) => value.toLowerCase().includes(term)) || (category.description || '').toLowerCase().includes(term)
    })
  }, [resolved, term, t])

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
        <SkeletonCards count={6} />
      </div>
    )
  }

  const nothingFound = visibleSections.length === 0 && visibleTopics.length === 0

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

      {nothingFound ? (
        <EmptyState
          icon={<svg className="mx-auto mb-4 h-12 w-12 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>}
          title={t('categories.noResults')}
          description={t('categories.helpDesc')}
        />
      ) : (
        <>
          {visibleSections.length > 0 && (
            <section aria-labelledby="sections-heading" className="space-y-4">
              <h2 id="sections-heading" className="text-xl font-bold text-[var(--color-text)]">{t('categories.sectionsTitle')}</h2>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {visibleSections.map((section) => (
                  <CategoryCard
                    key={section.slug}
                    category={{ _id: section.slug, name: section.slug, slug: section.slug }}
                    label={t(section.labelKey)}
                    image={categoryImage({ slug: section.slug })}
                    subsections={section.children.map((child) => ({
                      label: t(child.labelKey),
                      href: `/${section.slug}/${child.slug}`,
                    }))}
                  />
                ))}
              </div>
            </section>
          )}

          {visibleSubsections.length > 0 && (
            <section aria-labelledby="subsections-heading" className="space-y-4">
              <h2 id="subsections-heading" className="text-xl font-bold text-[var(--color-text)]">Explore every topic</h2>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visibleSubsections.map(({ section, child }) => (
                  <CategoryCard
                    key={section.slug + '-' + child.slug}
                    category={{ _id: child.slug, name: child.slug, slug: child.slug }}
                    label={t(child.labelKey)}
                    image={categoryImage({ slug: child.slug })}
                  />
                ))}
              </div>
            </section>
          )}

          {visibleTopics.length > 0 && (
            <section aria-labelledby="topics-heading" className="space-y-4">
              <h2 id="topics-heading" className="text-xl font-bold text-[var(--color-text)]">{t('categories.topicsTitle')}</h2>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visibleTopics.map(({ category, visual }) => (
                  <CategoryCard
                    key={category._id}
                    category={category}
                    label={visual.labelKey ? t(visual.labelKey) : category.name}
                    image={visual.image}
                  />
                ))}
              </div>
            </section>
          )}
        </>
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
