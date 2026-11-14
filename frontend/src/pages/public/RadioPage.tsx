import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { liveAPI, publicAPI, radioAPI, type RadioTimetable } from '../../services/api'
import { useI18n } from '../../context/I18nContext'
import { useSeo } from '../../utils/useSeo'
import { useAnnouncer } from '../../utils/useAnnouncer'
import {
  minutesToHear,
  play,
  RATE_CHOICES,
  scriptItem,
  setRate,
  speechSupported,
  stop,
  voiceItem,
  type AnnounceItem,
} from '../../utils/newsAnnouncer'
import { cn } from '../../utils/cn'

const PLAYLIST_SIZE = 12
const LIVE_POLL_MS = 20000
// The timetable is a wall clock, so the page has to notice the minute changing:
// at 18:00 the evening programme starts, and a reader who arrived at ten past
// should not be told the midday update is still on air.
const TIMETABLE_POLL_MS = 60000

/** "2h 5min" from the next start the server named; empty once it is due. */
function untilLabel(startsAt: string, at: number): string {
  const ms = new Date(startsAt).getTime() - at
  if (!Number.isFinite(ms) || ms <= 0) return ''
  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.max(1, Math.round((ms % 3_600_000) / 60_000))
  return hours ? `${hours}h ${minutes}min` : `${minutes}min`
}

// A number of stories is a bulletin, not a broadcast: the copy has to say what
// actually happens when the button is pressed, and the button only appears when
// the device can do it.
export default function RadioPage() {
  const { t, lang } = useI18n()
  const announcer = useAnnouncer()

  const [timetable, setTimetable] = useState<RadioTimetable | null>(null)
  const [spare, setSpare] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [live, setLive] = useState<Live | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useSeo({
    title: t('radio.seoTitle'),
    description: t('radio.seoDesc'),
    path: '/radio',
  })

  // The edition the desk assembled is what gets read, so the page asks the station
  // rather than picking stories itself. When nothing is scheduled - a timetable
  // nobody has filled in yet, or a storyless minute - it falls back to the newest
  // published stories and says so, instead of showing a dead button.
  const readTimetable = useCallback(async () => {
    try {
      const next = await radioAPI.getTimetable()
      setTimetable(next)
      setFailed(false)
      if (!next.bulletin?.stories.length) {
        const response = await publicAPI.getArticles({ language: 'en', limit: PLAYLIST_SIZE, sort: 'latest' })
        const payload = (response.data?.data || {}) as { articles?: Article[] }
        setSpare(Array.isArray(payload.articles) ? payload.articles : [])
      }
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void readTimetable()
    const timer = window.setInterval(() => void readTimetable(), TIMETABLE_POLL_MS)
    const tick = window.setInterval(() => setNow(Date.now()), 30000)
    return () => {
      window.clearInterval(timer)
      window.clearInterval(tick)
    }
  }, [readTimetable])

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

  const edition = timetable?.bulletin ?? null
  const programme = timetable?.current ?? null
  const nextUp = timetable?.next ?? null
  const stories = edition?.stories ?? spare

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

  // The presenter's lines belong to the bulletin rather than sitting above it as
  // decoration, so they enter the queue first and last and one press reads the
  // whole edition in the order the desk built it.
  const opening = useMemo(
    () => (edition ? scriptItem(edition.opening, { id: `opening-${edition.occurrence}`, title: t('radio.introRow') }) : null),
    [edition, t],
  )
  const closing = useMemo(
    () => (edition?.closing ? scriptItem(edition.closing, { id: `closing-${edition.occurrence}`, title: t('radio.outroRow') }) : null),
    [edition, t],
  )

  const playlist = useMemo(() => {
    const list: AnnounceItem[] = []
    if (opening) list.push(opening)
    rows.forEach((row) => list.push(row.item))
    if (closing) list.push(closing)
    return list
  }, [opening, rows, closing])

  const totalMinutes = useMemo(
    () => playlist.reduce((sum, item) => sum + minutesToHear(item, announcer.rate), 0),
    [playlist, announcer.rate],
  )

  const supported = speechSupported()
  const voiceReady = supported && announcer.hasEnglishVoice
  const onAir = announcer.status !== 'idle' && Boolean(announcer.current)
  const onAirLive = live?.status === 'active'

  const start = (index: number) => play(playlist, opening ? index + 1 : index)

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

        {programme && (
          <p className="mt-4 inline-flex flex-wrap items-center gap-2 rounded-full bg-emerald-500/15 px-3.5 py-1.5 text-xs font-bold text-emerald-100">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" aria-hidden="true" />
            {programme.name}
            <span className="font-medium text-slate-300">
              {t('radio.since')} {programme.at}
              {timetable?.timezone ? ` · ${timetable.timezone.replace(/_/g, ' ')}` : ''}
            </span>
          </p>
        )}
        {nextUp && (
          <p className="mt-2 text-xs text-slate-400">
            {t('radio.nextUp')} {nextUp.name} {t('radio.in')} {nextUp.at}
            {untilLabel(nextUp.startsAt, now) ? ` (${untilLabel(nextUp.startsAt, now)})` : ''}
          </p>
        )}

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
                onClick={() => play(playlist, 0)}
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
                  ? `${rows.length} ${t('radio.stories')} · ${totalMinutes} ${t('radio.minutes')}`
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

      {/* Who wrote the words being read is the reader's question, not a secret. */}
      {edition && (
        <section aria-labelledby="radio-edition-heading" className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 id="radio-edition-heading" className="flex items-center gap-2 text-base font-bold text-slate-900">
            <Radio className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            {programme ? `${t('radio.introTitle')} · ${programme.name}` : t('radio.introTitle')}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">&ldquo;{edition.opening}&rdquo;</p>
          <p className="mt-2 text-xs text-slate-500">
            {edition.scriptSource === 'ai'
              ? `${t('radio.introByAi')} ${edition.model || t('radio.voiceDefault')}. ${t('radio.introUnchecked')}`
              : t('radio.introByDesk')}
          </p>
          {edition.note && (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{edition.note}</span>
            </p>
          )}
        </section>
      )}

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
            {edition ? t('radio.onAirPlaylist') : t('radio.playlist')}
          </h2>
          <Link
            to="/articles"
            className="text-sm font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-300"
          >
            {t('radio.allNews')}
          </Link>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {edition ? t('radio.onAirPlaylistDesc') : programme ? t('radio.noStoriesYet') : t('radio.noProgramme')}
        </p>

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

        {!loading && rows.length > 0 && (
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

      {edition?.closing && (
        <p className="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <span className="mr-1 font-bold text-slate-900 dark:text-slate-100">{t('radio.outroRow')}:</span>
          &ldquo;{edition.closing}&rdquo;
        </p>
      )}

      <p className="mt-8 rounded-2xl bg-slate-50 px-5 py-4 text-sm leading-relaxed text-slate-600 dark:bg-slate-900 dark:text-slate-300">
        {t('radio.privacyNote')}
      </p>
    </div>
  )
}
