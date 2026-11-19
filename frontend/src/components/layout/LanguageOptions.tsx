import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Search } from 'lucide-react'
import { useI18n } from '../../context/I18nContext'
import { nearbyLanguages, useLanguageCatalog } from '../../utils/languageCatalog'
import { flagFor } from '../../utils/languageFlag'
import { SkeletonLine } from '../common/Skeleton'
import { cn } from '../../utils/cn'

/**
 * Every language Google Translate can serve, in one list.
 *
 * The short group on top is what a RADAR reader most likely wants; the search
 * box is what makes the other hundred and fifty reachable without turning the
 * header into a phone book. Choosing one is not a display trick: it is stored,
 * and every story request afterwards carries it, so the news arrives already
 * written in the language the reader asked for.
 */

interface LanguageOptionsProps {
  className?: string
  /** Close whatever contains the list, once a language is picked. */
  onPicked?: () => void
  autoFocus?: boolean
}

export default function LanguageOptions({ className, onPicked, autoFocus }: LanguageOptionsProps) {
  const { lang, setLang, t, chromeState } = useI18n()
  const { languages, isLoaded } = useLanguageCatalog()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  const nearby = useMemo(() => nearbyLanguages(languages), [languages])
  const all = useMemo(() => [...languages].sort((a, b) => a.name.localeCompare(b.name)), [languages])
  const matched = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return []
    return all.filter((item) => item.name.toLowerCase().includes(term) || item.code.toLowerCase().includes(term))
  }, [all, query])

  const choose = (code: string) => {
    setLang(code)
    onPicked?.()
  }

  const row = (code: string, name: string) => (
    <button
      key={code}
      type="button"
      onClick={() => choose(code)}
      role="option"
      aria-selected={lang === code}
      className={cn(
        'flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors',
        lang === code ? 'bg-[#062b52] text-white' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800',
      )}
    >
      {/* A flag is a scanning aid across two hundred rows, not a statement about
          who owns the language - so it is hidden from the screen reader, which
          gets the name, and the picture is never the only way to find a row. */}
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="notranslate shrink-0 text-base leading-none" aria-hidden="true">
          {flagFor(code)}
        </span>
        <span className="truncate">{name}</span>
      </span>
      {lang === code && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
    </button>
  )

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="relative shrink-0 border-b border-gray-100 px-3 py-2 dark:border-gray-800">
        <Search className="pointer-events-none absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('lang.search')}
          aria-label={t('lang.search')}
          className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-[#062b52] focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-800"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1" role="listbox" aria-label={t('nav.language')}>
        {chromeState === 'failed' && (
          <p className="border-b border-gray-100 px-4 py-2 text-xs text-gray-500 dark:border-gray-800">{t('lang.englishNote')}</p>
        )}
        {!isLoaded && (
          <div className="px-4 py-3">
            <SkeletonLine className="h-3 w-32" />
            <SkeletonLine className="mt-2 h-3 w-24" />
            <p className="mt-2 text-sm text-gray-500">{t('lang.translating')}</p>
          </div>
        )}

        {query.trim() ? (
          matched.length ? (
            matched.map((item) => row(item.code, item.name))
          ) : (
            <p className="px-4 py-3 text-sm text-gray-500">{t('lang.none')}</p>
          )
        ) : (
          <>
            <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{t('lang.popular')}</p>
            {nearby.map((item) => row(item.code, item.name))}
            <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{t('lang.all')}</p>
            {all
              .filter((item) => !nearby.some((short) => short.code === item.code))
              .map((item) => row(item.code, item.name))}
          </>
        )}
      </div>
    </div>
  )
}
