import { useEffect, useRef, useState } from 'react'
import { Globe } from 'lucide-react'
import { useI18n } from '../../context/I18nContext'
import { languageName, useLanguageCatalog } from '../../utils/languageCatalog'
import { DEFAULT_LANGUAGE } from '../../utils/readerLanguage'
import { cn } from '../../utils/cn'
import LanguageOptions from './LanguageOptions'

/**
 * The language button in the header and on the settings page. It opens the
 * whole list; the name it shows is the language the reader is actually reading
 * in, not whatever the browser was configured with.
 */

interface LanguageSelectorProps {
  className?: string
  buttonClassName?: string
  /**
   * The language name beside the globe. The header hides it until there is room
   * for it, because "Chinese (Traditional)" costs the masthead eighty pixels it
   * needs for a section name.
   */
  labelClassName?: string
}

export default function LanguageSelector({ className, buttonClassName, labelClassName }: LanguageSelectorProps) {
  const { lang, t } = useI18n()
  const { languages } = useLanguageCatalog()
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const label = lang === DEFAULT_LANGUAGE ? 'English' : languageName(languages, lang) || lang

  return (
    <div className={cn('relative', className)} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={t('lang.openPicker')}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={cn(
          'flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50',
          buttonClassName,
        )}
      >
        <Globe className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
        <span className={cn('max-w-[9rem] truncate', labelClassName)}>{label}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-1 flex max-h-[70vh] w-72 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
          <LanguageOptions className="min-h-0 flex-1" onPicked={() => setIsOpen(false)} autoFocus />
        </div>
      )}
    </div>
  )
}
