import { Link } from 'react-router-dom'
import { Headphones, Pause, Play, SkipBack, SkipForward, Square } from 'lucide-react'
import { useI18n } from '../../context/I18nContext'
import { useAnnouncer } from '../../utils/useAnnouncer'
import { skipStory, stop, togglePause } from '../../utils/newsAnnouncer'
import { cn } from '../../utils/cn'

// Three bars that move while the voice is talking and stop the moment it does.
// It is the only honest"on air" signal a text-to-speech desk can show.
function Equaliser({ active }: { active: boolean }) {
  return (
    <span className="flex h-4 items-end gap-0.5" aria-hidden="true">
      {[0, 1, 2].map((bar) => (
        <span
          key={bar}
          className={cn(
            'w-0.5 rounded-full bg-current transition-opacity',
            active ? 'animate-pulse' : 'opacity-40',
            bar === 1 ? 'h-4' : 'h-2.5',
          )}
          style={active ? { animationDelay: `${bar * 180}ms` } : undefined}
        />
      ))}
    </span>
  )
}

export default function AnnouncerBar() {
  const { t } = useI18n()
  const announcer = useAnnouncer()

  if (announcer.status === 'idle' || !announcer.current) return null

  const playing = announcer.status === 'playing'

  return (
    <div
      role="region"
      aria-label={t('radio.barLabel')}
      className="fixed bottom-16 left-0 right-0 z-40 border-t border-slate-800 bg-slate-900/95 text-white backdrop-blur md:bottom-0"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <span className="flex shrink-0 items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-emerald-300">
          <Equaliser active={playing} />
          <span className="hidden sm:inline">{playing ? t('radio.barSpeaking') : t('radio.barPaused')}</span>
          <Headphones className="h-4 w-4 sm:hidden" aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{announcer.current.title}</p>
          <p className="text-[11px] text-slate-400">
            {announcer.total > 1 && (
              <>
                {t('radio.barStory')} {announcer.position} / {announcer.total} ·{' '}
              </>
            )}
            {t('radio.barPart')} {announcer.part} / {announcer.partCount} · {t('radio.barVoice')}{' '}
            <span translate="no" className="font-semibold text-slate-300">
              {announcer.voiceName || t('radio.voiceDefault')}
            </span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => skipStory(-1)}
            disabled={announcer.position <= 1}
            aria-label={t('radio.previous')}
            className="rounded-lg p-2 text-slate-200 transition hover:bg-white/10 disabled:opacity-30"
          >
            <SkipBack className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={togglePause}
            aria-label={playing ? t('radio.pause') : t('radio.resume')}
            className="rounded-lg bg-white/10 p-2.5 text-white transition hover:bg-white/20"
          >
            {playing ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={() => skipStory(1)}
            disabled={announcer.position >= announcer.total}
            aria-label={t('radio.next')}
            className="rounded-lg p-2 text-slate-200 transition hover:bg-white/10 disabled:opacity-30"
          >
            <SkipForward className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={stop}
            aria-label={t('radio.stop')}
            className="rounded-lg p-2 text-slate-200 transition hover:bg-red-500/20 hover:text-red-200"
          >
            <Square className="h-4 w-4" aria-hidden="true" />
          </button>
          <Link
            to={announcer.current.href}
            className="ml-1 hidden rounded-lg border border-white/20 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-white/10 sm:inline-block"
          >
            {t('radio.openStory')}
          </Link>
        </div>
      </div>
    </div>
  )
}
