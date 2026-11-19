import { useEffect, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import type { Article, Category } from '../../types'
import { publicAPI } from '../../services/api'
import { useI18n } from '../../context/I18nContext'
import { resolvePathIn, sectionLabel, useSections } from '../../utils/sectionsStore'
import { featuresFor, type SectionNode } from '../../data/sections'
import ArticleList from '../../components/news/ArticleList'
import { SkeletonCards, SkeletonLine } from '../../components/common/Skeleton'
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
  // database spells"Amasport" still prints as Sports in English.
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
    if (!isLoaded) return <SkeletonLine className="mx-auto my-20 h-4 w-52" />
    return <Navigate to="/" replace />
  }

  const setParam = (name: string, value: string) => {
    const params = Object.fromEntries(searchParams)
    params[name] = value
    if (name !== 'page') params.page = '1'
    setSearchParams(params)
  }

  const siblings = section?.children || []
  const features = section ? featuresFor(section.slug) : []
  const totalPages = Math.ceil(payload.total / PER_PAGE)

  // One pill language for the whole page, so the section's own shelves, its
  // sub-sections and the sort tabs all read as the same control.
  const chip = (active: boolean) =>
    cn(
      'shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition',
      active
        ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
        : 'border-gray-200 bg-white text-gray-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-blue-700 dark:hover:bg-blue-950/50 dark:hover:text-blue-200',
    )

  if (isLoading) {
    return (
      <div className="space-y-6 px-4 py-6 sm:px-6">
        <SkeletonLine className="h-10 w-56" />
        <SkeletonCards count={6} />
      </div>
    )
  }

  return (
    // The card below is rounded and bordered, so it needs the page's own gutter:
    // against the edge of a phone it reads as a screen that failed to load.
    <div className="space-y-6 px-4 py-6 sm:px-6">
      {/*
        The section's own front door: the name and what is filed under it on the
        band above, then one line of controls underneath. The pills scroll
        sideways on a phone instead of stacking into a wall, and sit on one line
        with the sort tabs from the smallest tablet width up.
      */}
      <header className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-100 bg-gradient-to-br from-brand-50 via-white to-white px-4 py-5 dark:border-gray-800 dark:from-blue-950/40 dark:via-gray-900 dark:to-gray-900 sm:px-6">
          <nav className="flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400" aria-label={t('section.breadcrumb')}>
            <Link to="/" className="rounded transition hover:text-brand-600 dark:hover:text-brand-400">{t('nav.home')}</Link>
            <span aria-hidden="true">›</span>
            {child ? (
              <>
                <Link to={`/${section!.slug}`} className="rounded transition hover:text-brand-600 dark:hover:text-brand-400">{labelOf(section)}</Link>
                <span aria-hidden="true">›</span>
                <span className="font-semibold text-gray-900 dark:text-white">{labelOf(child)}</span>
              </>
            ) : (
              <span className="font-semibold text-gray-900 dark:text-white">{labelOf(section)}</span>
            )}
          </nav>

          <div className="mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
            <div className="min-w-0">
              <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-4xl">{label}</h1>
              {description && <p className="mt-2 max-w-3xl text-gray-600 dark:text-gray-400">{description}</p>}
            </div>
            <p className="shrink-0 rounded-full border border-brand-200 bg-white px-3 py-1 text-xs font-bold text-brand-700 dark:border-gray-700 dark:bg-gray-800 dark:text-blue-200">
              {payload.total} {t('category.count')}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4 sm:px-6">
          {(siblings.length > 0 || features.length > 0) && (
            <div
              className="-mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
              aria-label={t('section.subsections')}
            >
              <Link to={`/${section!.slug}`} className={chip(!child)}>
                {t('section.viewAll')}
              </Link>
              {siblings.map((item) => (
                <Link key={item.slug} to={`/${section!.slug}/${item.slug}`} className={chip(child?.slug === item.slug)}>
                  {labelOf(item)}
                </Link>
              ))}
              {/* A desk is not a shelf of the archive, so it is drawn apart from
                  the pills beside it and marked with the same pulse the header
                  panel gives it. */}
              {features.map((feature) => (
                <Link
                  key={feature.href}
                  to={feature.href}
                  className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-blue-600 bg-blue-50 px-3.5 py-1.5 text-[13px] font-bold text-blue-700 transition hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/50 dark:text-blue-200 dark:hover:bg-blue-900/50"
                >
                  {feature.live && (
                    <span className="relative flex h-1.5 w-1.5 shrink-0">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500 opacity-75 motion-reduce:hidden" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-600" />
                    </span>
                  )}
                  {t(feature.labelKey)}
                </Link>
              ))}
            </div>
          )}

          <div
            role="group"
            aria-label={t('section.sort')}
            className="flex shrink-0 items-center gap-1 self-start rounded-full bg-gray-100 p-1 dark:bg-gray-800 sm:self-auto"
          >
            {['latest', 'trending', 'popular'].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setParam('sort', option)}
                aria-pressed={sort === option}
                className={cn(
                  'whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-bold transition',
                  sort === option
                    ? 'bg-white text-brand-700 shadow-sm dark:bg-gray-900 dark:text-blue-200'
                    : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200',
                )}
              >
                {t(`articles.${option}`)}
              </button>
            ))}
          </div>
        </div>
      </header>

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
              className={chip(false)}
            >
              {labelOf(item)}
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
