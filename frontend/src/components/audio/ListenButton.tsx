import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Headphones, Square } from 'lucide-react'
import type { Article } from '../../types'
import { useI18n } from '../../context/I18nContext'
import { useAnnouncer } from '../../utils/useAnnouncer'
import { play, speechSupported, stop, voiceItem } from '../../utils/newsAnnouncer'

/**
 * Reads one story aloud with the reader's own English voice. The control only
 * exists when the browser can actually speak: a button that promises a voice
 * this device does not have is worse than no button at all.
 */
export default function ListenButton({ article }: { article: Article }) {
  const { t } = useI18n()
  const announcer = useAnnouncer()

  const english = !article.language || article.language.toLowerCase().startsWith('en')
  const ready = speechSupported() && announcer.hasEnglishVoice && english
  // Cutting the script into sentences is not free, so it happens once per story
  // rather than on every render of the page.
  const item = useMemo(() => (ready ? voiceItem(article) : null), [article, ready])
  if (!item) return null

  const isThis = announcer.current?.id === item.id && announcer.status !== 'idle'

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => (isThis ? stop() : play([item], 0))}
        aria-pressed={isThis}
        className={
          isThis
            ? 'inline-flex items-center gap-1.5 rounded-full bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-emerald-800'
            : 'inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'
        }
      >
        {isThis ? <Square className="h-3.5 w-3.5" aria-hidden="true" /> : <Headphones className="h-3.5 w-3.5" aria-hidden="true" />}
        {isThis ? t('radio.stopThis') : t('radio.listenThis')}
      </button>
      <Link
        to="/radio"
        className="text-xs font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-300"
      >
        {t('radio.moreAudio')}
      </Link>
    </div>
  )
}
