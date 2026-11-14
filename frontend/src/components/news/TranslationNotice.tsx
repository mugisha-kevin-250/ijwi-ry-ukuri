import { Languages } from 'lucide-react'
import type { Article } from '../../types'
import { useI18n } from '../../context/I18nContext'
import { DEFAULT_LANGUAGE } from '../../utils/readerLanguage'

/**
 * One honest line about what language the reader is actually reading in.
 *
 * A translation that happened says so, because a machine wrote it and the
 * newsroom did not. A translation that did not happen also says so, because
 * promising Luganda and showing English is worse than admitting the site is
 * still in English. When the reader is in English there is nothing to report.
 */
export default function TranslationNotice({ article, className }: { article: Article; className?: string }) {
  const { lang, t } = useI18n()
  if (lang === DEFAULT_LANGUAGE) return null

  const served = article.translation?.translated === true && article.translation.lang === lang
  // A story written in another language is left exactly as its writer typed it:
  // the translator works from English, and guessing at the rest would give a
  // worse story than the real one. No line, no claim.
  if (!served && article.language && !article.language.toLowerCase().startsWith('en')) return null

  return (
    <p className={className ?? 'flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400'}>
      <Languages className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {served ? t('lang.translatedNote') : t('lang.englishNote')}
    </p>
  )
}
