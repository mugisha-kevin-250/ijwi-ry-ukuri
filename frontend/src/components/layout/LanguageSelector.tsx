import { useEffect, useRef, useState } from 'react'
import { Globe, Check, ChevronDown } from 'lucide-react'
import { useI18n, type Lang } from '../../context/I18nContext'
import { cn } from '../../utils/cn'

const LANGUAGE_NAMES: Record<Lang, { name: string; nativeName: string }> = {
  rw: { name: 'Kinyarwanda', nativeName: 'Ikinyarwanda' },
  en: { name: 'English', nativeName: 'English' },
  fr: { name: 'French', nativeName: 'Français' },
  sw: { name: 'Swahili', nativeName: 'Kiswahili' },
}

interface LanguageSelectorProps {
  className?: string
  buttonClassName?: string
}

export default function LanguageSelector({ className, buttonClassName }: LanguageSelectorProps) {
  const { lang, setLang, t, supportedLanguages } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const current = LANGUAGE_NAMES[lang] ?? LANGUAGE_NAMES.en

  return (
    <div className={cn('relative', className)} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className={cn(
          'flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50',
          buttonClassName
        )}
        aria-label={t('nav.language')}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <Globe className="h-4 w-4" aria-hidden="true" />
        <span>{current.nativeName}</span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} aria-hidden="true" />
      </button>

      {isOpen && (
        <ul
          className="absolute right-0 z-50 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg focus:outline-none"
          role="listbox"
          aria-label={t('nav.language')}
        >
          {supportedLanguages.map((code) => (
            <li key={code}>
              <button
                type="button"
                onClick={() => {
                  setLang(code)
                  setIsOpen(false)
                }}
                className={cn(
                  'flex w-full items-center justify-between px-4 py-2 text-left text-sm transition-colors',
                  lang === code ? 'bg-blue-50 font-medium text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                )}
                role="option"
                aria-selected={lang === code}
              >
                {LANGUAGE_NAMES[code].nativeName}
                {lang === code && <Check className="h-4 w-4" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
