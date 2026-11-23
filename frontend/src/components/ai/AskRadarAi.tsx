import { Link } from 'react-router-dom'
import { ArrowRight, Sparkles } from 'lucide-react'
import { useI18n } from '../../context/I18nContext'

/**
 * The two doors into RADAR AI.
 *
 * There used to be a third thing here: a panel that opened over the page and
 * held its own little chat. The desk has a page now, and a reader who wants to
 * ask something wants the whole window rather than a box squeezed under the
 * news - so both of these are links, and both of them are the only job they
 * have.
 *
 * - `strip` is the line at the top of the home page, where the red breaking
 *   banner used to be.
 * - `card` is the block at the end of a story. It carries the story with it, so
 *   the chat opens grounded on the thing the reader just finished instead of a
 *   blank box about nothing in particular.
 *
 * Neither one asks the server whether the desk is staffed any more. That answer
 * belongs to the page that has to display it, and asking from every home view
 * and every story view spent a call on the free plan to say something the door
 * could not act on.
 */
interface AskRadarAiProps {
  variant?: 'strip' | 'card'
  /** Slug of the story the reader is on, when there is one. */
  slug?: string
  /** Its headline, so the chat can name it back to them. */
  storyTitle?: string
}

export default function AskRadarAi({ variant = 'strip', slug = '', storyTitle = '' }: AskRadarAiProps) {
  const { t } = useI18n()
  const isCard = variant === 'card'

  const to = slug
    ? { pathname: '/radar-ai', state: { story: { slug, title: storyTitle } } }
    : '/radar-ai'

  if (isCard) {
    return (
      <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-sky-50 p-5 text-center">
        <Sparkles className="mx-auto h-7 w-7 text-blue-700" />
        <h3 className="mt-2 text-lg font-extrabold text-slate-900">{t('ai.explainTitle')}</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">{t('ai.explainBody')}</p>
        <Link
          to={to}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-blue-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-800"
        >
          <Sparkles className="h-4 w-4" />
          {t('ai.explainButton')}
        </Link>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-r from-blue-800 via-blue-700 to-sky-600 text-white">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 text-xs sm:px-6 lg:px-8">
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded bg-white px-2 py-1 text-[11px] font-extrabold uppercase tracking-wide text-blue-700">
          <Sparkles className="h-3.5 w-3.5" />
          {t('ai.badge')}
        </span>
        {/* The line says what the desk is, never a headline: this row used to be
            a breaking banner, and a reader who mistakes it for one will not
            notice the door beside it. */}
        <p className="truncate font-medium">{t('ai.stripBody')}</p>
        <Link
          to={to}
          className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold text-white transition hover:bg-white/25"
        >
          {t('ai.ask')}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  )
}
