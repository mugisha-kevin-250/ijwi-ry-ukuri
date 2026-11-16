import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Home, RefreshCw, Search, X } from 'lucide-react'
import { scoresAPI } from '../../services/api'
import type { Scoreboard, ScoreEvent, ScoreGroup, ScoreMatch, ScoreRow, ScoreSearch, ScoreSide, Standings, StandingsRow } from '../../services/api'
import { serverMessage } from '../../services/apiClient'
import { useI18n } from '../../context/I18nContext'
import { Loading } from '../../components/common/Loading'
import { useSeo } from '../../utils/useSeo'
import { cn } from '../../utils/cn'

/**
 * The scores page.
 *
 * It is a page of the newsroom, so it is drawn in the newsroom's blue and white
 * rather than in a sports app's black and green, and it reads the same way on a
 * phone as on a monitor: a column of times at the left, the two teams stacked at
 * the right, competition headers between them. That shape is what makes a score
 * findable without scanning, and it is the reason the rows are not cards.
 *
 * Every number on it came from our own database. The page asks RADAR for the
 * day, and RADAR asks the feed once a minute for whatever somebody is looking
 * at - so a thousand readers on one bus Wi-Fi are a thousand reads of Mongo and
 * one upstream call, and nobody's address is ever the thing that gets blocked.
 */

type Tab = 'all' | 'live' | 'finished' | 'upcoming'

const TABS: { id: Tab; key: string }[] = [
  { id: 'all', key: 'liveSports.all' },
  { id: 'live', key: 'liveSports.live' },
  { id: 'finished', key: 'liveSports.finished' },
  { id: 'upcoming', key: 'liveSports.upcoming' },
]

/** How long the search box waits for the reader to stop typing. */
const SEARCH_DEBOUNCE_MS = 300

/** The feed's cache key for a day, `YYYYMMDD`, on the reader's own calendar. */
function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}${month}${day}`
}

/** Back from `YYYYMMDD` without the timezone shift a bare `new Date(string)` gives. */
function dateFromKey(key: string): Date {
  const digits = String(key || '').replace(/\D/g, '')
  if (digits.length !== 8) return new Date()
  const value = new Date(Number(digits.slice(0, 4)), Number(digits.slice(4, 6)) - 1, Number(digits.slice(6, 8)))
  return Number.isNaN(value.getTime()) ? new Date() : value
}

function shiftDay(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function kickoff(date: string | null): string {
  if (!date) return ''
  const at = new Date(date)
  if (Number.isNaN(at.getTime())) return ''
  return at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
}

/**
 * The one word a row shows in its status column.
 *
 * A fixture that has not started shows its kick-off time, a match being played
 * shows the clock the feed printed, and a finished one says so - never a minute,
 * because "90+'" under a final score reads like the game is still going.
 */
function statusOf(row: ScoreRow, ft: string): { text: string; live: boolean } {
  if (row.state === 'in') return { text: row.clock || row.statusText || 'LIVE', live: true }
  if (row.state === 'post') return { text: ft, live: false }
  return { text: kickoff(row.start) || row.statusText, live: false }
}

/**
 * A team's picture, or its initials.
 *
 * A badge that fails to load leaves a hole in the row and the reader wonders
 * which team they are looking at, so the name's initials take the empty circle
 * instead. The image is not decorative: on a scores page a crest is how you find
 * your own team in a list of twenty.
 */
function TeamCrest({ logo, name, size = 'sm' }: { logo: string; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const [broken, setBroken] = useState(false)
  const box = size === 'lg' ? 'h-9 w-9' : size === 'md' ? 'h-7 w-7' : 'h-6 w-6'
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase()
  const text = size === 'lg' ? 'text-[11px]' : 'text-[9px]'
  if (!logo || broken) {
    return (
      <span
        aria-hidden="true"
        className={cn('flex shrink-0 items-center justify-center rounded-full bg-blue-50 font-bold text-blue-700 ring-1 ring-inset ring-blue-100', box, text)}
      >
        {letters || '—'}
      </span>
    )
  }
  return (
    <img
      src={logo}
      alt=""
      loading="lazy"
      onError={() => setBroken(true)}
      className={cn('shrink-0 rounded-full bg-white object-contain p-0.5', box)}
    />
  )
}

/**
 * The score, or nothing.
 *
 * A fixture that has not been played has no score, and printing `0` for one tells
 * the reader a match ended nil-nil. The backend already blanks it; the page blanks
 * it again rather than trusting one layer, because this is the single figure on
 * the page a reader acts on.
 */
function ScoreValue({ side, state }: { side: ScoreSide; state: ScoreRow['state'] }) {
  const shown = state === 'pre' ? '' : side.score
  return (
    <span
      className={cn(
        'w-5 shrink-0 text-right text-[15px] leading-none tabular-nums',
        shown ? 'font-bold text-[#062b52] dark:text-blue-200' : 'font-medium text-blue-300 dark:text-blue-800',
        state !== 'post' && side.winner && 'text-blue-700 dark:text-blue-300',
      )}
    >
      {shown || '–'}
    </span>
  )
}

function MatchRow({ row, code, ft, onOpen }: { row: ScoreRow; code: string; ft: string; onOpen: (row: ScoreRow, code: string) => void }) {
  const status = statusOf(row, ft)
  return (
    <button
      type="button"
      onClick={() => onOpen(row, code)}
      className="group flex w-full items-stretch gap-3 border-b border-blue-50 px-3 py-2.5 text-left transition last:border-b-0 hover:bg-blue-50/70 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 dark:border-gray-800 dark:hover:bg-blue-950/30 sm:px-4"
      aria-label={`${row.home.name} versus ${row.away.name}. ${status.text}`}
    >
      {/* The time column. Fixed width so every row's teams start at the same x,
          which is the whole reason a list of scores can be scanned. */}
      <span className="flex w-14 shrink-0 flex-col items-start justify-center gap-1 pt-0.5">
        {status.live ? (
          <span className="flex items-center gap-1 rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold leading-none tracking-wide text-white">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
            </span>
            {status.text}
          </span>
        ) : (
          <span className={cn('text-xs font-semibold tabular-nums', row.state === 'post' ? 'text-blue-400' : 'text-blue-700 dark:text-blue-300')}>
            {status.text || '–'}
          </span>
        )}
      </span>

      <span className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
        {[row.home, row.away].map((side, index) => (
          <span key={index} className="flex min-w-0 items-center gap-2">
            <TeamCrest logo={side.logo} name={side.name} />
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-sm',
                // The side that lost is dimmed, so a glance at a finished row
                // tells you who won before you have read either name.
                row.state === 'post' && !side.winner ? 'font-medium text-blue-400 dark:text-gray-500' : 'font-semibold text-[#0b3a67] dark:text-gray-100',
              )}
            >
              {side.name || side.short || '—'}
            </span>
            <ScoreValue side={side} state={row.state} />
          </span>
        ))}
      </span>
    </button>
  )
}

function LeagueSection({ group, ft, onOpen }: { group: ScoreGroup; ft: string; onOpen: (row: ScoreRow, code: string) => void }) {
  const { t } = useI18n()
  return (
    <section className="overflow-hidden rounded-xl border border-blue-100 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <header className="flex items-center gap-2 border-b border-blue-100 bg-blue-50/60 px-3 py-2 dark:border-gray-800 dark:bg-gray-950/40 sm:px-4">
        <TeamCrest logo={group.logo} name={group.name} size="md" />
        <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-[#062b52] dark:text-blue-200">{group.name}</h2>
        {/* Not a number the newsroom invented: whether this league's rows are the
            newest the feed gave us, said in words next to them. */}
        {group.pending && (
          <span className="flex items-center gap-1 text-[11px] font-medium text-blue-500">
            <RefreshCw className="h-3 w-3 animate-spin" />
            <span className="hidden sm:inline">{t('liveSports.leaguePending')}</span>
          </span>
        )}
        {!group.pending && group.stale && (
          <span className="hidden items-center gap-1 text-[11px] font-medium text-amber-600 sm:flex">{t('liveSports.leagueStale')}</span>
        )}
      </header>
      {group.error && !group.matches.length && (
        <p className="px-4 py-3 text-xs text-amber-700 dark:text-amber-400">{t('liveSports.leagueFailed')}</p>
      )}
      {group.matches.length ? (
        <div>
          {group.matches.map((row) => (
            <MatchRow key={row.id || `${row.home.id}-${row.away.id}`} row={row} code={group.code} ft={ft} onOpen={onOpen} />
          ))}
        </div>
      ) : !group.error ? (
        <p className="px-4 py-4 text-xs text-blue-400">{t('liveSports.noMatches')}</p>
      ) : null}
    </section>
  )
}

function EventLine({ event }: { event: ScoreEvent }) {
  const mark =
    event.kind === 'goal'
      ? '⚽'
      : event.kind === 'card'
        ? /red/i.test(event.label)
          ? '🟥'
          : '🟨'
        : event.kind === 'substitution'
          ? '⇄'
          : '•'
  return (
    <li className="flex gap-2.5 border-b border-blue-50 py-2.5 last:border-b-0 dark:border-gray-800">
      <span className="w-12 shrink-0 text-xs font-bold tabular-nums text-blue-600 dark:text-blue-400">{event.minute || '–'}</span>
      <span className="shrink-0 text-sm leading-5" aria-hidden="true">{mark}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold uppercase tracking-wide text-blue-400">{event.teamName || event.label}</span>
        {event.players.length > 0 && (
          <span className="mt-0.5 block text-sm font-medium text-[#0b3a67] dark:text-gray-100">{event.players.join(', ')}</span>
        )}
        {event.text && <span className="mt-0.5 block text-xs leading-5 text-blue-500 dark:text-gray-400">{event.text}</span>}
      </span>
    </li>
  )
}

function StatBar({ label, home, away, homeValue, awayValue }: { label: string; home: string; away: string; homeValue: number | null; awayValue: number | null }) {
  // A bar is only drawn when the feed gave both sides a real number. A statistic
  // printed as text - "12 / 31" - is still shown, just as two figures, because a
  // width invented from a string is a guess about the game.
  const drawable = homeValue !== null && awayValue !== null && (homeValue + awayValue) > 0
  const share = drawable ? Math.round((homeValue! / (homeValue! + awayValue!)) * 100) : 50
  return (
    <div className="py-2.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className="w-10 font-bold tabular-nums text-[#062b52] dark:text-blue-200">{home || '–'}</span>
        <span className="font-semibold uppercase tracking-wide text-blue-400">{label}</span>
        <span className="w-10 text-right font-bold tabular-nums text-[#062b52] dark:text-blue-200">{away || '–'}</span>
      </div>
      {drawable ? (
        <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-blue-100 dark:bg-gray-800" aria-hidden="true">
          <span className="bg-blue-600" style={{ width: `${share}%` }} />
        </div>
      ) : null}
    </div>
  )
}

function TableList({ rows, note }: { rows: StandingsRow[]; note: string }) {
  const { t } = useI18n()
  return (
    <div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-blue-400">
            <th scope="col" className="w-8 py-1.5 text-left font-semibold">#</th>
            <th scope="col" className="py-1.5 text-left font-semibold">{t('liveSports.thTeam')}</th>
            <th scope="col" className="w-7 py-1.5 text-right font-semibold">{t('liveSports.thPlayed')}</th>
            <th scope="col" className="hidden w-7 py-1.5 text-right font-semibold sm:table-cell">{t('liveSports.thWin')}</th>
            <th scope="col" className="hidden w-7 py-1.5 text-right font-semibold sm:table-cell">{t('liveSports.thDraw')}</th>
            <th scope="col" className="hidden w-7 py-1.5 text-right font-semibold sm:table-cell">{t('liveSports.thLoss')}</th>
            <th scope="col" className="w-9 py-1.5 text-right font-semibold">{t('liveSports.thGoalDiff')}</th>
            <th scope="col" className="w-9 py-1.5 text-right font-semibold">{t('liveSports.thPoints')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.team.id}-${index}`} className="border-t border-blue-50 dark:border-gray-800">
              <td className="py-1.5 text-left font-bold tabular-nums text-blue-500">{row.rank || '–'}</td>
              <td className="max-w-0 py-1.5">
                <span className="flex items-center gap-2">
                  <TeamCrest logo={row.team.logo} name={row.team.name} />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-[#0b3a67] dark:text-gray-100">{row.team.name || '—'}</span>
                    {/* The competition's own note and its own take-off, both of
                        which change what a row means. */}
                    {(row.note || row.deductions) && (
                      <span className="block truncate text-[10px] text-amber-600 dark:text-amber-400">
                        {[row.note, row.deductions && `${row.deductions} ${t('liveSports.deducted')}`].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                </span>
              </td>
              <td className="py-1.5 text-right tabular-nums text-blue-500">{row.played ?? '–'}</td>
              <td className="hidden py-1.5 text-right tabular-nums text-blue-500 sm:table-cell">{row.win ?? '–'}</td>
              <td className="hidden py-1.5 text-right tabular-nums text-blue-500 sm:table-cell">{row.draw ?? '–'}</td>
              <td className="hidden py-1.5 text-right tabular-nums text-blue-500 sm:table-cell">{row.loss ?? '–'}</td>
              <td className="py-1.5 text-right tabular-nums text-blue-500">{row.difference || '–'}</td>
              <td className="py-1.5 text-right font-bold tabular-nums text-[#062b52] dark:text-blue-200">{row.points || '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {note && <p className="mt-2 text-[11px] leading-4 text-blue-400">{note}</p>}
    </div>
  )
}

function MatchDialog({ row, code, onClose }: { row: ScoreRow; code: string; onClose: () => void }) {
  const { t } = useI18n()
  const [tab, setTab] = useState<'summary' | 'events' | 'stats' | 'table'>('summary')
  const [match, setMatch] = useState<ScoreMatch | null>(null)
  const [standings, setStandings] = useState<Standings | null>(null)
  const [tableFailed, setTableFailed] = useState(false)
  const [failed, setFailed] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setFailed('')
    // The row already on screen is kept as the answer while the detail is being
    // read, so opening a match never flashes a blank panel at the reader.
    scoresAPI
      .match(row.id, code)
      .then((detail) => {
        if (cancelled) return
        setMatch(detail)
        setTab(detail.events.length ? 'events' : 'summary')
      })
      .catch((error) => {
        if (!cancelled) setFailed(serverMessage(error, t('liveSports.failed')))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [row.id, code, t])

  // The table is only fetched when the reader asks for it. It changes once a
  // matchday, not once a minute, and a panel that pulled it for every click
  // would spend the newsroom's one-call-a-minute budget on the least urgent
  // number on the page.
  const wantTable = tab === 'table'
  useEffect(() => {
    if (!wantTable || standings || tableFailed) return
    let cancelled = false
    scoresAPI
      .standings(code)
      .then((rows) => {
        if (!cancelled) setStandings(rows)
      })
      .catch(() => {
        if (!cancelled) setTableFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [wantTable, code, standings, tableFailed])

  const groups = useMemo(() => {
    if (!standings) return []
    const named = new Map<string, StandingsRow[]>()
    standings.rows.forEach((entry) => {
      const key = entry.table || ''
      if (!named.has(key)) named.set(key, [])
      named.get(key)!.push(entry)
    })
    return [...named.entries()]
  }, [standings])

  const status = statusOf(row, t('liveSports.ft'))
  const sides = [match?.home || row.home, match?.away || row.away]

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center overflow-y-auto bg-[#031a33]/60 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={row.name}>
      <div className="relative w-full max-w-lg overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-gray-900 sm:rounded-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 z-10 rounded-full bg-white/20 p-1.5 text-white transition hover:bg-white/40"
          aria-label={t('liveSports.close')}
        >
          <X className="h-4 w-4" />
        </button>

        {/* The scoreline header: this is the one thing a reader came to check, so
            it is the biggest thing in the panel and it never moves when the tabs
            under it change. */}
        <div className="border-b border-blue-100 bg-gradient-to-b from-blue-600 to-blue-700 px-4 pb-4 pt-5 text-white dark:border-gray-800">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-100">{match?.league?.name || row.shortName || status.text}</p>
          {sides.map((side, index) => (
            <div key={index} className="mt-3 flex items-center gap-3">
              <TeamCrest logo={side.logo} name={side.name} size="lg" />
              <span className="min-w-0 flex-1 truncate text-sm font-bold sm:text-base">{side.name || '—'}</span>
              {/* Blank before kick-off, for the same reason the row is blank: a
                  zero here is a scoreline, not an absence of one. */}
              <span className="min-w-[1.25rem] text-right text-xl font-extrabold tabular-nums">
                {row.state === 'pre' ? '' : side.score || ''}
              </span>
            </div>
          ))}
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-blue-100">
            <span className="flex items-center gap-1.5">
              {status.live ? (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                </span>
              ) : null}
              {match?.statusText || row.statusText || status.text}
            </span>
            {match?.venue && <span className="truncate">{match.venue}</span>}
          </p>
        </div>

        <div className="flex gap-1 border-b border-blue-100 px-3 pt-2 dark:border-gray-800">
          {([
            ['summary', t('liveSports.summary')],
            ['events', t('liveSports.events')],
            ['stats', t('liveSports.stats')],
            ['table', t('liveSports.table')],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                'rounded-t-lg border-b-2 px-2.5 py-2 text-xs font-bold transition',
                tab === id ? 'border-blue-600 text-blue-700 dark:text-blue-300' : 'border-transparent text-blue-400 hover:text-blue-600',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="max-h-[55vh] overflow-y-auto px-4 py-3 sm:max-h-[60vh]">
          {loading && !match && <div className="flex justify-center py-8"><Loading /></div>}
          {failed && (
            <p className="flex items-center gap-2 py-4 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {failed}
            </p>
          )}

          {tab === 'summary' && match && (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-blue-400">{t('liveSports.kickoff')}</dt><dd className="font-semibold text-[#0b3a67] dark:text-gray-100">{kickoff(match.start || row.start) || '–'}</dd></div>
              {(match.venue || row.venue) && <div className="flex justify-between gap-4"><dt className="text-blue-400">{t('liveSports.venue')}</dt><dd className="text-right font-semibold text-[#0b3a67] dark:text-gray-100">{match.venue || row.venue}</dd></div>}
              {match.attendance && <div className="flex justify-between gap-4"><dt className="text-blue-400">{t('liveSports.attendance')}</dt><dd className="font-semibold tabular-nums text-[#0b3a67] dark:text-gray-100">{match.attendance}</dd></div>}
              {(match.home.formation || match.away.formation) && (
                <div className="flex justify-between gap-4">
                  <dt className="text-blue-400">{t('liveSports.summary')}</dt>
                  <dd className="text-right font-semibold text-[#0b3a67] dark:text-gray-100">{match.home.formation || '–'} / {match.away.formation || '–'}</dd>
                </div>
              )}
              {(match.home.record || match.away.record) && (
                <div className="flex justify-between gap-4">
                  <dt className="text-blue-400">{t('liveSports.played')}</dt>
                  <dd className="text-right font-semibold tabular-nums text-[#0b3a67] dark:text-gray-100">{match.home.record || '–'} / {match.away.record || '–'}</dd>
                </div>
              )}
              {(match.home.players.length > 0 || match.away.players.length > 0) && (
                <div className="pt-2">
                  {[match.home, match.away].map((side, index) => (
                    <div key={index} className="mb-3">
                      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-blue-400">{side.name}</p>
                      <ul className="space-y-1">
                        {side.players.filter((player) => player.starter).map((player, playerIndex) => (
                          <li key={`${player.id}-${playerIndex}`} className="flex items-baseline gap-2 text-sm">
                            <span className="w-6 shrink-0 text-right text-xs tabular-nums text-blue-400">{player.jersey || ''}</span>
                            <span className="min-w-0 flex-1 truncate font-medium text-[#0b3a67] dark:text-gray-100">{player.name}</span>
                            <span className="shrink-0 text-[11px] uppercase text-blue-400">{player.position}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </dl>
          )}

          {tab === 'events' && (
            match && match.events.length ? (
              <ul>
                {match.events.map((event, index) => (
                  <EventLine key={`${event.minute}-${index}`} event={event} />
                ))}
              </ul>
            ) : (
              <p className="py-4 text-sm text-blue-400">{t('liveSports.noEvents')}</p>
            )
          )}

          {tab === 'stats' && match && (
            match.stats.length || match.possession ? (
              <div>
                {match.possession && (
                  <StatBar
                    label={match.possession.label}
                    home={match.possession.home}
                    away={match.possession.away}
                    homeValue={Number.parseFloat(match.possession.home)}
                    awayValue={Number.parseFloat(match.possession.away)}
                  />
                )}
                {match.stats.map((stat, index) => (
                  <StatBar
                    key={`${stat.name}-${index}`}
                    label={stat.label}
                    home={stat.home}
                    away={stat.away}
                    homeValue={stat.homeValue}
                    awayValue={stat.awayValue}
                  />
                ))}
              </div>
            ) : (
              <p className="py-4 text-sm text-blue-400">{t('liveSports.noStats')}</p>
            )
          )}

          {/* The table lives in here as well as on its own, because the question
              a reader asks after a score is nearly always "so what does that do
              to the standings". */}
          {tab === 'table' && (
            standings && standings.rows.length ? (
              <div className="space-y-4">
                {groups.map(([name, rows]) => (
                  <div key={name || 'table'}>
                    {name && <p className="mb-1 text-xs font-bold uppercase tracking-wide text-blue-400">{name}</p>}
                    <TableList rows={rows} note={groups.length > 1 ? '' : t('liveSports.tableOrderNote')} />
                  </div>
                ))}
              </div>
            ) : tableFailed || (standings && !standings.rows.length) ? (
              <p className="py-4 text-sm text-blue-400">{t('liveSports.tableUnavailable')}</p>
            ) : (
              <div className="flex justify-center py-6"><Loading /></div>
            )
          )}
        </div>
      </div>
    </div>
  )
}

export default function LiveSportsPage() {
  const { t } = useI18n()
  const [day, setDay] = useState(() => new Date())
  const [tab, setTab] = useState<Tab>('all')
  // Null is "every competition we follow"; a code is the chip the reader picked.
  const [league, setLeague] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ScoreSearch | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [searchFailed, setSearchFailed] = useState(false)
  const [board, setBoard] = useState<Scoreboard | null>(null)
  const [failed, setFailed] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [open, setOpen] = useState<{ row: ScoreRow; code: string } | null>(null)

  const key = dayKey(day)
  // The last request a reader still wants an answer from. A poll that lands
  // after they have moved to tomorrow, or to one competition, must not repaint
  // the page they left.
  const asking = useRef('')

  const load = useCallback(async (dateKey: string, code: string | null, quiet = false) => {
    const token = `${dateKey}|${code || ''}`
    asking.current = token
    if (!quiet) setIsLoading(true)
    try {
      const payload = await scoresAPI.scoreboard({ date: dateKey, league: code || undefined })
      if (asking.current !== token) return
      setBoard(payload)
      setFailed('')
    } catch (error) {
      if (asking.current !== token) return
      // A date outside the window is the server's own sentence, and it is the
      // true reason the page is empty - so it is printed rather than replaced
      // with a generic "could not load".
      setFailed(serverMessage(error, t('liveSports.failedHint')))
      if (!quiet) setBoard(null)
    } finally {
      if (asking.current === token) setIsLoading(false)
    }
  }, [t])

  useEffect(() => {
    load(key, league)
  }, [key, league, load])

  // The interval comes from the payload, not from a number written here: the
  // server knows whether a match is being played, and says thirty seconds when
  // one is and five minutes when the day is quiet. A page that polls a finished
  // Monday every half minute is a page that costs the newsroom thirteen times
  // what it should.
  useEffect(() => {
    if (!board) return undefined
    const every = Math.max(board.pollSeconds, 15) * 1000
    const timer = window.setInterval(() => {
      // Nobody is watching a hidden tab; asking for it would be spending the
      // one-minute upstream budget on an empty screen.
      if (document.hidden) return
      load(key, league, true)
    }, every)
    return () => window.clearInterval(timer)
  }, [board, key, league, load])

  // Coming back to the tab is the moment a reader expects the newest score, and
  // the interval may be minutes away.
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) load(key, league, true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [key, league, load])

  // Searching waits for the reader to stop typing. Every word is one read of our
  // own cached collection - the feed is never asked anything on somebody's
  // keystroke - so this is cheap, but it is still not worth doing forty times
  // for one name.
  const searchToken = useRef(0)
  useEffect(() => {
    const term = query.trim()
    const token = searchToken.current + 1
    searchToken.current = token
    if (term.length < 2) {
      setResults(null)
      setIsSearching(false)
      setSearchFailed(false)
      return undefined
    }
    setIsSearching(true)
    const timer = window.setTimeout(async () => {
      try {
        const found = await scoresAPI.search(term)
        if (searchToken.current !== token) return
        setResults(found)
        setSearchFailed(false)
      } catch (error) {
        if (searchToken.current !== token) return
        setResults(null)
        setSearchFailed(true)
      } finally {
        if (searchToken.current === token) setIsSearching(false)
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query])

  const visible = useMemo(() => {
    const groups = board?.groups || []
    return groups
      .map((group) => ({
        ...group,
        matches: group.matches.filter((row) => {
          if (tab === 'live') return row.state === 'in'
          if (tab === 'finished') return row.state === 'post'
          if (tab === 'upcoming') return row.state === 'pre'
          return true
        }),
      }))
      .filter((group) => group.matches.length || (tab === 'all' && group.error && !group.matches.length))
  }, [board, tab])

  const shown = visible.reduce((count, group) => count + group.matches.length, 0)

  // A reader who is looking at search results does not also need to be told that
  // the day underneath is empty: those answer two different questions, and
  // printing both makes the list look like a note beside nothing.
  const quietDay = shown === 0 && Boolean(results && (results.matches.length > 0 || results.competitions.length > 0))

  const leagueChip = (active: boolean) =>
    cn(
      'shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-bold transition',
      active
        ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
        : 'border-blue-100 bg-white text-blue-700 hover:border-blue-300 hover:bg-blue-50 dark:border-gray-700 dark:bg-gray-900 dark:text-blue-200 dark:hover:bg-gray-800',
    )

  const label = useMemo(() => {
    const today = dayKey(new Date())
    if (key === today) return t('liveSports.today')
    if (key === dayKey(shiftDay(new Date(), -1))) return t('liveSports.yesterday')
    if (key === dayKey(shiftDay(new Date(), 1))) return t('liveSports.tomorrow')
    return dateFromKey(key).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  }, [key, t])

  useSeo({
    title: `${t('liveSports.title')} - Live football scores, fixtures and results`,
    description: t('liveSports.tagline'),
    path: '/live-sports',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: `${t('liveSports.title')} | RADAR`,
      description: t('liveSports.tagline'),
      isPartOf: { '@type': 'WebSite', name: 'RADAR' },
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: (board?.groups || []).flatMap((group) =>
          group.matches.slice(0, 5).map((row, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            item: {
              '@type': 'SportsEvent',
              name: row.name || `${row.home.name} v ${row.away.name}`,
              startDate: row.start || undefined,
              homeTeam: { '@type': 'SportsTeam', name: row.home.name },
              awayTeam: { '@type': 'SportsTeam', name: row.away.name },
            },
          })),
        ).slice(0, 30),
      },
    },
  })

  return (
    <div className="min-h-[70vh] bg-blue-50/40 pb-10 dark:bg-gray-950">
      {/*
        The strip that makes this a scores page rather than a list: the way back
        to the newsroom, the day, and what is being watched. It sticks under the
        header so a reader who has scrolled to the Turkish table can still turn to
        tomorrow.
      */}
      <div className="sticky top-[var(--header-h)] z-30 border-b border-blue-100 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-2 sm:px-4">
          <Link
            to="/"
            aria-label={t('liveSports.home')}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-blue-700"
          >
            <Home className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('liveSports.home')}</span>
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-sm font-extrabold uppercase tracking-wide text-[#062b52] dark:text-blue-200">
            {t('liveSports.title')}
          </h1>
          <span className="hidden text-xs font-medium text-blue-400 sm:inline">
            {board?.refreshing ? (
              <span className="flex items-center gap-1">
                <RefreshCw className="h-3 w-3 animate-spin" />
                {t('liveSports.refreshing')}
              </span>
            ) : board?.counts.live ? (
              `${board.counts.live} ${t('liveSports.liveNow').toLowerCase()}`
            ) : (
              label
            )}
          </span>
        </div>

        {/* Day turning. The date control is a real one, because a reader who
            wants last Saturday should type it rather than tap left six times. */}
        <div className="mx-auto flex max-w-3xl items-center gap-1.5 px-3 pb-2 sm:px-4">
          <button
            type="button"
            onClick={() => setDay((current) => shiftDay(current, -1))}
            className="rounded-lg p-1.5 text-blue-600 transition hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-gray-800"
            aria-label={t('liveSports.yesterday')}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-[#062b52] dark:bg-gray-800 dark:text-blue-200">
            <CalendarDays className="h-3.5 w-3.5 text-blue-500" />
            {label}
          </span>
          <input
            type="date"
            value={`${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`}
            onChange={(event) => {
              const value = event.target.value
              if (value) setDay(dateFromKey(value.replace(/-/g, '')))
            }}
            aria-label={t('liveSports.pickDate')}
            className="hidden rounded-lg border border-blue-100 bg-white px-2 py-1 text-xs font-medium text-blue-700 outline-none transition focus:border-blue-400 dark:border-gray-700 dark:bg-gray-900 dark:text-blue-200 sm:block"
          />
          <button
            type="button"
            onClick={() => setDay((current) => shiftDay(current, 1))}
            className="rounded-lg p-1.5 text-blue-600 transition hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-gray-800"
            aria-label={t('liveSports.tomorrow')}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {key !== dayKey(new Date()) && (
            <button
              type="button"
              onClick={() => setDay(new Date())}
              className="ml-1 rounded-lg px-2 py-1 text-xs font-bold text-blue-600 underline-offset-2 hover:underline dark:text-blue-300"
            >
              {t('liveSports.today')}
            </button>
          )}
          {/* The way to "where is my club" without walking fourteen competitions
              one tab at a time. It searches what this server has already read. */}
          <div className="relative ml-auto min-w-0 flex-1 sm:max-w-[15rem]">
            <label htmlFor="scores-search" className="sr-only">{t('liveSports.search')}</label>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-blue-400" aria-hidden="true" />
            <input
              id="scores-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('liveSports.search')}
              className="w-full rounded-lg border border-blue-100 bg-white py-1.5 pl-8 pr-7 text-xs font-medium text-[#062b52] outline-none transition placeholder:font-normal placeholder:text-blue-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-900 dark:text-blue-100 dark:placeholder:text-gray-500 dark:focus:ring-blue-950"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={t('liveSports.clearSearch')}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-blue-400 transition hover:text-blue-700 dark:hover:text-blue-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="mx-auto flex max-w-3xl gap-1 border-t border-blue-50 px-3 dark:border-gray-800 sm:px-4">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              className={cn(
                'relative flex-1 border-b-2 px-1 py-2 text-xs font-bold transition',
                tab === entry.id
                  ? 'border-blue-600 text-blue-700 dark:text-blue-300'
                  : 'border-transparent text-blue-400 hover:text-blue-600 dark:hover:text-blue-300',
              )}
            >
              {t(entry.key)}
              {board && (
                <span className="ml-1 tabular-nums opacity-70">
                  {entry.id === 'all'
                    ? board.counts.total
                    : entry.id === 'live'
                      ? board.counts.live
                      : entry.id === 'finished'
                        ? board.counts.finished
                        : board.counts.upcoming}
                </span>
              )}
              {entry.id === 'live' && (board?.counts.live || 0) > 0 && (
                <span className="absolute right-1 top-1.5 h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-600" />
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-3 pt-4 sm:px-4">
        {isLoading && !board && <div className="flex justify-center py-16"><Loading /></div>}

        {failed && (
          <div className="rounded-xl border border-blue-100 bg-white p-5 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <AlertTriangle className="mx-auto h-6 w-6 text-blue-400" />
            <p className="mt-2 text-sm font-bold text-[#062b52] dark:text-blue-200">{t('liveSports.failed')}</p>
            <p className="mt-1 text-xs text-blue-500 dark:text-gray-400">{failed}</p>
            <button
              type="button"
              onClick={() => load(key, league)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-700"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t('liveSports.retry')}
            </button>
          </div>
        )}

        {board && board.stale && !failed && (
          <p className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-medium leading-4 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t('liveSports.staleNotice')}
          </p>
        )}

        {/*
          Every competition the newsroom follows, named, on one line. The list
          below only draws the leagues that have something on the day, which is
          right for reading and wrong for finding: without this row a reader
          cannot tell "we do not follow Turkey" from "Turkey has nothing today",
          and has no way to ask for one competition instead of scrolling thirteen.
        */}
        {board && board.followed.length > 0 && (
          <div
            className="mb-3 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label={t('liveSports.competitions')}
          >
            <button type="button" onClick={() => setLeague(null)} aria-pressed={!league} className={leagueChip(!league)}>
              {t('liveSports.all')}
            </button>
            {board.followed.map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={() => setLeague(league === item.code ? null : item.code)}
                aria-pressed={league === item.code}
                className={leagueChip(league === item.code)}
              >
                {item.name}
              </button>
            ))}
          </div>
        )}

        {query.trim().length >= 2 && (
          <div className="mb-3 rounded-xl border border-blue-100 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-blue-400">
              {isSearching && <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />}
              {searchFailed
                ? t('liveSports.searchFailed')
                : results
                  ? t('liveSports.searchResults')
                  : t('liveSports.searching')}
            </p>

            {results && results.competitions.length > 0 && (
              <div className="mt-2">
                <p className="text-[11px] font-bold text-blue-500 dark:text-blue-300">{t('liveSports.searchCompetitions')}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {results.competitions.map((item) => (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => {
                        setLeague(item.code)
                        setQuery('')
                      }}
                      className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 transition hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-200 dark:hover:bg-blue-900/50"
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {results && results.matches.length > 0 && (
              <div className="mt-2 space-y-2">
                <p className="text-[11px] font-bold text-blue-500 dark:text-blue-300">{t('liveSports.searchMatches')}</p>
                {results.matches.map((row) => (
                  <div key={`${row.dateKey}-${row.id}`}>
                    <p className="mb-0.5 px-1 text-[10px] font-bold uppercase tracking-wide text-blue-300 dark:text-blue-400">
                      {row.leagueName} · {dateFromKey(row.dateKey).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                    </p>
                    <MatchRow row={row} code={row.code} ft={t('liveSports.ft')} onOpen={(picked, code) => setOpen({ row: picked, code })} />
                  </div>
                ))}
              </div>
            )}

            {results && !isSearching && !results.matches.length && !results.competitions.length && (
              <p className="mt-1 text-xs leading-5 text-blue-500 dark:text-gray-400">{t('liveSports.searchEmpty')}</p>
            )}
          </div>
        )}

        {board && !failed && (
          <div className="space-y-3">
            {shown === 0 && board.refreshing ? (
              /* An empty day and a day nobody has read yet are two different
                 facts. Saying "no matches" while the server is still fetching
                 would be a lie a reader could act on, so this says what it is
                 and asks again on the page's own clock. */
              <div className="flex flex-col items-center gap-2 rounded-xl border border-blue-100 bg-white p-6 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />
                <p className="text-sm font-bold text-[#062b52] dark:text-blue-200">{t('liveSports.refreshing')}</p>
              </div>
            ) : shown === 0 ? (
              quietDay ? null : (
              <div className="rounded-xl border border-blue-100 bg-white p-6 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <p className="text-sm font-bold text-[#062b52] dark:text-blue-200">
                  {league && tab === 'all'
                    ? t('liveSports.noLeagueMatches')
                    : tab === 'live'
                      ? t('liveSports.noLive')
                      : tab === 'finished'
                        ? t('liveSports.noFinished')
                        : tab === 'upcoming'
                          ? t('liveSports.noUpcoming')
                          : t('liveSports.noMatches')}
                </p>
                <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-blue-500 dark:text-gray-400">
                  {tab === 'live' ? t('liveSports.noLiveHint') : t('liveSports.noMatchesHint')}
                </p>
              </div>
              )
            ) : (
              visible.map((group) => <LeagueSection key={group.code} group={group} ft={t('liveSports.ft')} onOpen={(row, code) => setOpen({ row, code })} />)
            )}
          </div>
        )}

        {/* Said once, at the bottom, in the reader's own language: the thing that
            makes this page different from embedding somebody else's scores. */}
        {board && (
          <p className="mt-5 text-[11px] leading-4 text-blue-400">
            {t('liveSports.sourceNote')}
            {board.counts.total > 0 && (
              <span className="ml-1">
                {board.counts.total} {board.counts.total === 1 ? t('liveSports.matchCountOne') : t('liveSports.matchCount')} {label.toLowerCase()}.
              </span>
            )}
          </p>
        )}
      </div>

      {open && <MatchDialog row={open.row} code={open.code} onClose={() => setOpen(null)} />}
    </div>
  )
}
