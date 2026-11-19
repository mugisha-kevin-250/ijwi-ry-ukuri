import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useI18n } from '../../context/I18nContext'

/** Every page the newsroom owes its readers, in one place so the links and the
 *  labels never drift apart between the footer and the pages themselves. */
export const PUBLISHER_PAGES = [
  { href: '/about', key: 'publisher.about' },
  { href: '/contact', key: 'publisher.contact' },
  { href: '/editorial-policy', key: 'publisher.editorial' },
  { href: '/corrections', key: 'publisher.corrections' },
  { href: '/advertising', key: 'publisher.advertising' },
  { href: '/privacy', key: 'publisher.privacy' },
  { href: '/cookies', key: 'publisher.cookies' },
  { href: '/disclaimer', key: 'publisher.disclaimer' },
  { href: '/terms', key: 'publisher.terms' },
] as const

export default function PublisherPage({
  title,
  intro,
  updated,
  children,
}: {
  title: string
  intro: string
  updated?: string
  children: ReactNode
}) {
  const { t } = useI18n()
  const { pathname } = useLocation()

  return (
    /* Every public page is responsible for its own gutter - the layout only
       offsets the fixed header - so a shell that never had one set its legal
       copy against the edge of the phone, with no gutter on either side. */
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
      <nav aria-label={t('articles.breadcrumb')} className="text-sm text-gray-500 dark:text-gray-400">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link to="/" className="transition-colors hover:text-brand-600 dark:hover:text-brand-400">{t('nav.home')}</Link>
          </li>
          <li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5" /></li>
          <li aria-current="page" className="font-medium text-gray-900 dark:text-white">{title}</li>
        </ol>
      </nav>

      <header className="space-y-3">
        <p className="text-sm font-semibold text-brand-700 dark:text-brand-300">{t('publisher.eyebrow')}</p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 dark:text-white">{title}</h1>
        <p className="text-lg leading-relaxed text-gray-600 dark:text-gray-300">{intro}</p>
        {updated && (
          <p className="text-sm text-gray-400 dark:text-gray-500">{t('publisher.lastUpdated')}: {updated}</p>
        )}
      </header>

      <div className="space-y-8 text-[1.0625rem] leading-[1.8] text-gray-700 dark:text-gray-300">{children}</div>

      <nav
        aria-label={t('publisher.more')}
        className="rounded-xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-900"
      >
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('publisher.more')}</h2>
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {PUBLISHER_PAGES.filter((page) => page.href !== pathname).map((page) => (
            <li key={page.href}>
              <Link to={page.href} className="font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
                {t(page.key)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

export function Section({ title, children }: { title: string, children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h2>
      {children}
    </section>
  )
}
