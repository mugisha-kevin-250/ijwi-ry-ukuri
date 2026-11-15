import { useEffect, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import type { Article, Category } from '../../types'
import { publicAPI } from '../../services/api'
import { useI18n } from '../../context/I18nContext'
import { resolvePathIn, sectionLabel, useSections } from '../../utils/sectionsStore'
import type { SectionNode } from '../../data/sections'
import ArticleList from '../../components/news/ArticleList'
import { Loading, LoadingGrid } from '../../components/common/Loading'
import EmptyState from '../../components/common/EmptyState'
import Pagination from '../../components/common/Pagination'
import { cn } from '../../utils/cn'
import { absoluteSiteUrl, useSeo } from '../../utils/useSeo'

const PER_PAGE = 12

interface SectionPayload {
  articles: Article[]
  total: number
  category: Category | null
}

const EMPTY_PAYLOAD: SectionPayload = { articles: [], total: 0, category: null }

export default function SectionPage() {
  const { section: sectionSlug, sub: subSlug } = useParams<{ section: string; sub?: string }>()
  const { t } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const [payload, setPayload] = useState<SectionPayload>(EMPTY_PAYLOAD)
  const [isLoading, setIsLoading] = useState(true)
  // A section the newsroom created after this build was made is not in the
  // shipped table, so the page waits for the server's list before it decides the
  // address is one it cannot serve.
  const { sections, isLoaded } = useSections()

  const resolved = resolvePathIn(sections, sectionSlug, subSlug)
  const section = resolved?.section ?? null
  const child = resolved?.child ?? null
  const path = section ? `/${section.slug}${child ? `/${child.slug}` : ''}` : '/'

  // The name comes from the language the reader is reading in, so a section the
  // database spells "Amasport" still prints as Sports in English.
  const labelOf = (node: SectionNode | null) => sectionLabel(node, t)
  const label = child ? labelOf(child) : labelOf(section)
  const description = payload.category?.description || ''
  const sort = searchParams.get('sort') || 'latest'
  const page = parseInt(searchParams.get('page') || '1', 10)

  useSeo({
    title: section ? label : undefined,
    description: description || undefined,
    path: section ? path : undefined,
    jsonLd: section
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: label,
            description: description || undefined,
            url: absoluteSiteUrl(path),
            mainEntity: {
              '@type': 'ItemList',
              numberOfItems: payload.total,
              itemListElement: payload.articles.map((article, index) => ({
                '@type': 'ListItem',
                position: index + 1,
                url: absoluteSiteUrl(`/article/${article.slug}`),
                name: article.title,
              })),
            },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: t('nav.home'), item: absoluteSiteUrl('/') },
              { '@type': 'ListItem', position: 2, name: labelOf(section), item: absoluteSiteUrl(`/${section!.slug}`) },
              ...(child
                ? [{ '@type': 'ListItem', position: 3, name: labelOf(child), item: absoluteSiteUrl(path) }]
                : []),
            ],
          },
        ]
      : undefined,
  })

  useEffect(() => {
    if (!resolved) {
      setIsLoading(false)
      return
    }
    let active = true
    setIsLoading(true)
    publicAPI
      .getSectionArticles(resolved.section.slug, resolved.child?.slug, page, PER_PAGE, sort)
      .then((response) => {
        if (!active) return
        const data = response.data.data as unknown as SectionPayload
        setPayload({ articles: data.articles || [], total: data.total || 0, category: data.category || null })
      })
      .catch((error) => {
        console.error('Failed to fetch section articles:', error)
        if (active) setPayload(EMPTY_PAYLOAD)
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [sectionSlug, subSlug, section?.slug, child?.slug, page, sort])

  // The address is only a dead end once the server has said what its sections
  // are; before that, sending the reader home would be a guess.
  if (!resolved) {
    if (!isLoaded) return <Loading className="py-20" />
    return <Navigate to="/" replace />
  }

  const setParam = (name: string, value: string) => {
    const params = Object.fromEntries(searchParams)
    params[name] = value
    if (name !== 'page') params.page = '1'
    setSearchParams(params)
  }

  const siblings = section?.children || []
  const totalPages = Math.ceil(payload.total / PER_PAGE)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Loading className="h-10 w-56" />
        <LoadingGrid count={6} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <nav className="flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400" aria-label={t('section.breadcrumb')}>
          <Link to="/" className="hover:text-brand-600 dark:hover:text-brand-400">{t('nav.home')}</Link>
          <span aria-hidden="true">›</span>
          {child ? (
            <>
              <Link to={`/${section!.slug}`} className="hover:text-brand-600 dark:hover:text-brand-400">{labelOf(section)}</Link>
              <span aria-hidden="true">›</span>
              <span className="font-semibold text-gray-900 dark:text-white">{labelOf(child)}</span>
            </>
          ) : (
            <span className="font-semibold text-gray-900 dark:text-white">{labelOf(section)}</span>
          )}
        </nav>

        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white sm:text-4xl">{label}</h1>
          {description && <p className="mt-2 max-w-3xl text-gray-600 dark:text-gray-400">{description}</p>}
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{payload.total} {t('category.count')}</p>
        </div>

        {siblings.length > 0 && (
          <div className="flex flex-wrap gap-2" aria-label={t('section.subsections')}>
            <Link
              to={`/${section!.slug}`}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm font-medium transition',
                !child
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
              )}
            >
              {t('section.viewAll')}
            </Link>
            {siblings.map((item) => (
              <Link
                key={item.slug}
                to={`/${section!.slug}/${item.slug}`}
                className={cn(
                  'rounded-full px-3 py-1.5 text-sm font-medium transition',
                  child?.slug === item.slug
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
                )}
              >
                {labelOf(item)}
              </Link>
            ))}
          </div>
        )}
      </header>

      <div className="flex flex-wrap gap-2">
        {['latest', 'trending', 'popular'].map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setParam('sort', option)}
            aria-pressed={sort === option}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              sort === option
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
            )}
          >
            {t(`articles.${option}`)}
          </button>
        ))}
      </div>

      {payload.articles.length === 0 ? (
        <EmptyState
          icon={<svg className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>}
          title={t('category.empty')}
          description={t('section.emptyDesc')}
          action={<Link to="/articles" className="text-brand-600 hover:underline">{t('categories.browseAll')}</Link>}
        />
      ) : (
        <ArticleList articles={payload.articles} variant="grid" emptyMessage={t('category.empty')} />
      )}

      {totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={(next) => setParam('page', String(next))}
        />
      )}

      <section className="border-t border-gray-200 pt-8 dark:border-gray-800">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('section.more')}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {sections.filter((item) => item.slug !== section!.slug).map((item) => (
            <Link
              key={item.slug}
              to={`/${item.slug}`}
              className="rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:border-brand-300 hover:text-brand-600 dark:border-gray-700 dark:text-gray-300 dark:hover:text-brand-400"
            >
              {labelOf(item)}
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
