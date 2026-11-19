import { Link } from 'react-router-dom'
import { Headphones } from 'lucide-react'
import { useI18n } from '../../context/I18nContext'
import { useAnnouncer } from '../../utils/useAnnouncer'
import { speechSupported } from '../../utils/newsAnnouncer'
import { cn } from '../../utils/cn'

/**
 * The address of RADAR Audio. It is not a fake"we are broadcasting" light: the
 * pulse only appears while a voice is genuinely speaking on this device, and a
 * browser with no speech engine still gets the link, because the page explains
 * what is missing instead of hiding the feature.
 */
export default function RadioNewsButton({ className }: { className?: string }) {
  const { t } = useI18n()
  const announcer = useAnnouncer()
  const speaking = announcer.status !== 'idle'
  const canSpeak = speechSupported() && announcer.hasEnglishVoice

  return (
    <Link
      to="/radio"
      aria-label={speaking ? `${t('nav.radio')} — ${t('radio.barSpeaking')}` : t('nav.radio')}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide transition sm:text-xs',
        speaking
          ? 'border-emerald-600 bg-emerald-600 text-white shadow-[0_0_0_3px_rgba(16,185,129,0.25)] hover:bg-emerald-700'
          : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800',
        className,
      )}
    >
      <span className="relative flex h-2 w-2" aria-hidden="true">
        {speaking && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />}
        <span className={cn('relative inline-flex h-2 w-2 rounded-full', speaking ? 'bg-white' : 'bg-emerald-500')} />
      </span>
      <Headphones className="hidden h-3.5 w-3.5 sm:block" aria-hidden="true" />
      {t('nav.radio')}
      {!canSpeak && <span className="sr-only">- {t('radio.noVoiceShort')}</span>}
    </Link>
  )
}
