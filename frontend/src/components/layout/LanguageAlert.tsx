import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useI18n } from '../../context/I18nContext'
import { languageChosen, markLanguageAnswered } from '../../utils/readerLanguage'
import LanguageOptions from './LanguageOptions'

/**
 * The one question a news site should ask before a reader asks it: which
 * language do you want to read in?
 *
 * It appears once per browser, and never again after an answer - picking a
 * language stores it, and so does continuing in English. It is deliberately not
 * a cookie wall and not a blocking modal: the news is behind it, readable, and
 * a reader who shuts it loses nothing.
 */

export default function LanguageAlert() {
  const { t } = useI18n()
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    // One question per browser. Picking a language answers it, and so does
    // closing the box - markLanguageAnswered is what both of them write.
    if (languageChosen()) return
    // Let the page paint and the splash finish before asking anything.
    const open = window.setTimeout(() => setIsOpen(true), 900)
    return () => window.clearTimeout(open)
  }, [])

  const dismiss = () => {
    markLanguageAnswered()
    setIsOpen(false)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="language-alert-title">
      <div className="max-h-[86vh] w-full max-w-md overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-gray-900">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <div>
            <h2 id="language-alert-title" className="text-lg font-bold text-gray-900 dark:text-white">
              {t('lang.choose')}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('lang.chooseDesc')}</p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t('lang.continue')}
            className="shrink-0 rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <LanguageOptions className="max-h-[46vh]" onPicked={dismiss} autoFocus />

        <div className="border-t border-gray-100 px-5 py-3 dark:border-gray-800">
          <button
            type="button"
            onClick={dismiss}
            className="text-sm font-medium text-[#062b52] transition hover:underline dark:text-blue-400"
          >
            {t('lang.continue')}
          </button>
          <span className="ml-3 text-xs text-gray-400">{t('lang.anytime')}</span>
        </div>
      </div>
    </div>
  )
}
