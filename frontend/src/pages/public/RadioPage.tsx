import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ChevronRight,
  Gauge,
  Headphones,
  Loader2,
  Play,
  Radio,
  Square,
  VolumeX,
  WifiOff,
} from 'lucide-react'
import type { Article, Live } from '../../types'
import { liveAPI, publicAPI } from '../../services/api'
import { useI18n } from '../../context/I18nContext'
import { useSeo } from '../../utils/useSeo'
import { useAnnouncer } from '../../utils/useAnnouncer'
import {
  minutesToHear,
  play,
  RATE_CHOICES,
  setRate,
  speechSupported,
  stop,
  voiceItem,
  type AnnounceItem,
} from '../../utils/newsAnnouncer'
import { cn } from '../../utils/cn'

const PLAYLIST_SIZE = 12
const LIVE_POLL_MS = 20000

// A number of stories is a bulletin, not a broadcast: the copy has to say what
// actually happens when the button is pressed, and the button only appears when
// the device can do it.
export default function RadioPage() {
  const { t, lang } = useI18n()
  const announcer = useAnnouncer()

  const [stories, setStories] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [live, setLive] = useState<Live | null>(null)

  useSeo({
    title: t('radio.seoTitle'),
    description: t('radio.seoDesc'),
    path: '/radio',
  })

  useEffect(() => {
    let active = true
    setLoading(true)
    publicAPI
      .getArticles({ language: 'en', limit: PLAYLIST_SIZE, sort: 'latest' })
      .then((response) => {
        if (!active) return
        const payload = (response.data?.data || {}) as { articles?: Article[] }
        setStories(Array.isArray(payload.articles) ? payload.articles : [])
      })
      .catch(() => {
        if (active) setFailed(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  // The same desk shows whether a human being is on air with a camera right now.
  useEffect(() => {
    let active = true
    const read = async () => {
      try {
        const response = await liveAPI.getCurrent()
        if (active) setLive(response.data.data.live ?? null)
      } catch {
        // The last known state stays; a hiccup must not claim a broadcast ended.
      }
    }
    void read()
    const timer = window.setInterval(read, LIVE_POLL_MS)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  // A story the voice cannot read (nothing but an image, say) is dropped here
  // rather than left in the list as a row that does nothing when pressed.
  const rows = useMemo(() => {
    const list: { story: Article; item: AnnounceItem }[] = []
    stories.forEach((story) => {
      const item = voiceItem(story)
      if (item) list.push({ story, item })
    })
    return list
  }, [stories])
  const playlist = useMemo(() => rows.map((row) => row.item), [rows])
  const totalMinutes = useMemo(
    () => playlist.reduce((sum, item) => sum + minutesToHear(item, announcer.rate), 0),
    [playlist, announcer.rate],
  )

  const supported = speechSupported()
  const voiceReady = supported && announcer.hasEnglishVoice
  const onAir = announcer.status !== 'idle' && Boolean(announcer.current)
  const onAirLive = live?.status === 'active'

  const start = (index: number) => play(playlist, index)

  const when = (value?: string) =>
    value ? new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : ''

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="rounded-2xl border border-slate-200 bg-slate-900 p-6 text-white shadow-sm sm:p-8">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300">
          <Headphones className="h-4 w-4" aria-hidden="true" />
          {t('radio.kicker')}
        </p>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">{t('radio.title')}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">{t('radio.desc')}</p>

        {supported && !announcer.hasEnglishVoice && (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-100 px-4 py-3 text-sm font-semibold text-amber-900">
            <VolumeX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t('radio.noVoice')}</span>
          </p>
        )}
        {!supported && (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-100 px-4 py-3 text-sm font-semibold text-amber-900">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t('radio.unsupported')}</span>
          </p>
        )}

        {voiceReady && (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {onAir ? (
              <button
                type="button"
                onClick={stop}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-900 transition hover:bg-slate-200"
              >
                <Square className="h-4 w-4" aria-hidden="true" />
                {t('radio.stopBulletin')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => start(0)}
                disabled={!playlist.length}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-900 transition hover:bg-emerald-400 disabled:opacity-50"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                {t('radio.playBulletin')}
              </button>
            )}
            <p className="text-sm text-slate-300">
              {onAir
                ? `${t('radio.nowPlaying')} ${announcer.position} / ${announcer.total}`
                : playlist.length > 0
                  ? `${playlist.length} ${t('radio.stories')} · ${totalMinutes} ${t('radio.minutes')}`
                  : t('radio.empty')}
            </p>
            <label className="ml-auto flex items-center gap-2 text-xs font-semibold text-slate-300">
              <Gauge className="h-4 w-4" aria-hidden="true" />
              <span>{t('radio.speed')}</span>
              <select
                value={announcer.rate}
                onChange={(event) => setRate(Number(event.target.value))}
                className="rounded-lg border border-white/25 bg-slate-800 px-2 py-1.5 text-xs font-bold text-white outline-none focus:border-emerald-400"
              >
                {RATE_CHOICES.map((choice) => (
                  <option key={choice} value={choice}>
                    {choice}
                    {'\u00D7'}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {announcer.failure === 'engine' && (
          <p className="mt-4 flex items-start gap-2 text-sm font-semibold text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t('radio.engineFailed')}</span>
          </p>
        )}
      </header>

      {/* A real broadcast beats a synthetic voice, so it is offered first. */}
      <section aria-labelledby="radio-live-heading" className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 id="radio-live-heading" className="flex items-center gap-2 text-base font-bold text-slate-900">
          <Radio className={cn('h-4 w-4', onAirLive ? 'text-red-600' : 'text-slate-400')} aria-hidden="true" />
          {t('radio.liveTitle')}
        </h2>
        {onAirLive && live ? (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold uppercase text-white">
                {t('radio.liveOn')}
              </span>{' '}
              {live.title}
            </p>
            <Link
              to="/live"
              className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-red-700"
            >
              {t('radio.openLive')}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">
            {t('radio.liveOff')}{' '}
            <Link to="/live" className="font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
              {t('radio.liveArchive')}
            </Link>
          </p>
        )}
      </section>

      <section aria-labelledby="radio-list-heading" className="mt-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="radio-list-heading" className="text-lg font-extrabold tracking-tight text-slate-900">
            {t('radio.playlist')}
          </h2>
          <Link
            to="/articles"
            className="text-sm font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-300"
          >
            {t('radio.allNews')}
          </Link>
        </div>
        <p className="mt-1 text-sm text-slate-500">{t('radio.playlistDesc')}</p>

        {loading && (
          <p className="mt-6 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {t('radio.loading')}
          </p>
        )}

        {failed && !loading && (
          <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {t('radio.loadFailed')}
          </p>
        )}

        {!loading && !failed && playlist.length === 0 && (
          <p className="mt-6 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">{t('radio.noStories')}</p>
        )}

        {!loading && playlist.length > 0 && (
          <ol className="mt-4 space-y-2">
            {rows.map(({ story, item }, index) => {
              const isCurrent = announcer.current?.id === item.id && onAir
              return (
                <li
                  key={item.id}
                  className={cn(
                    'rounded-2xl border bg-white p-4 transition',
                    isCurrent ? 'border-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]' : 'border-slate-200 hover:border-slate-300',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 w-5 shrink-0 text-center text-sm font-bold text-slate-400">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[1rem] font-bold leading-snug text-slate-900">
                        <Link to={item.href} className="hover:underline">
                          {item.title}
                        </Link>
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {typeof story?.author === 'object' && story?.author?.fullName ? `${story.author.fullName} · ` : ''}
                        {when(story?.publishedAt || story?.createdAt)} ·{' '}
                        <span className="font-semibold text-slate-600">{minutesToHear(item, announcer.rate)}</span>{' '}
                        {t('radio.minutes')}
                      </p>
                      {isCurrent && (
                        <p className="mt-2 text-xs font-bold uppercase tracking-wide text-emerald-700">
                          {t('radio.nowPlaying')} · {announcer.part} / {announcer.partCount}
                        </p>
                      )}
                    </div>
                    {voiceReady && (
                      <button
                        type="button"
                        onClick={() => start(index)}
                        aria-label={`${t('radio.listen')} ${item.title}`}
                        className={cn(
                          'inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition',
                          isCurrent && announcer.status === 'playing'
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                            : 'bg-slate-900 text-white hover:bg-slate-700',
                        )}
                      >
                        {isCurrent && announcer.status === 'playing' ? (
                          <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <Play className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {isCurrent && announcer.status === 'playing' ? t('radio.stop') : t('radio.listen')}
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <p className="mt-8 rounded-2xl bg-slate-50 px-5 py-4 text-sm leading-relaxed text-slate-600 dark:bg-slate-900 dark:text-slate-300">
        {t('radio.privacyNote')}
      </p>
    </div>
  )
}
