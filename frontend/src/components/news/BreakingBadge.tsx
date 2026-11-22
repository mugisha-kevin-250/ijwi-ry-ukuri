import { readsAsBreaking } from '../../utils/breakingStory'
import { useI18n } from '../../context/I18nContext'

interface Props {
  article?: { isBreaking?: boolean; breakingAt?: string | Date | null } | null
  /** On a picture, where white text sits on whatever the photograph is. */
  onImage?: boolean
  className?: string
}

/**
 * The one honest use of the word "breaking".
 *
 * It is a pill on a card and on a story, and deliberately not a strip across
 * the top of every page: the newsroom took that line away in favour of Ask
 * RADAR AI, and a breaking banner that came back wearing another name would be
 * the same decision unmade. Because the desk can only flag a handful at a time
 * and the flag ages out on its own, seeing this is information rather than
 * decoration.
 */
export default function BreakingBadge({ article, onImage = false, className = '' }: Props) {
  const { t } = useI18n()
  if (!readsAsBreaking(article)) return null

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wide ${
        onImage ? 'bg-[#d93025] text-white' : 'bg-[#fde8e8] text-[#d93025] dark:bg-[#3b1a17] dark:text-[#f87171]'
      } ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {t('articles.breaking')}
    </span>
  )
}
