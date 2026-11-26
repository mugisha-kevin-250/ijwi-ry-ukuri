import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ExternalLink, History, RefreshCw, TrendingUp } from 'lucide-react'
import { adminAPI, type TrendCluster, type TrendGeoRecord, type TrendHistory, type TrendRadar as TrendRadarData, type TrendScore, type TrendTopicRecord } from '../../services/api'

// Google Trends accepts country-specific two-letter ISO regions. This complete
// directory lets editors look up a region even when it is not in TREND_GEOS;
// only the selected country is fetched, so opening this control never fans out
// 200+ upstream requests.
const COUNTRY_CODES = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ')
const CountryDisplayNames = (Intl as unknown as { DisplayNames: new (locales: string[], options: { type: 'region' }) => { of(code: string): string | undefined } }).DisplayNames
const COUNTRY_NAMES = new CountryDisplayNames(['en'], { type: 'region' })
const COUNTRIES = COUNTRY_CODES.map((code) => ({ code, name: COUNTRY_NAMES.of(code) || code }))

/**
 * The searches Google reports for the regions this newsroom writes about.
 *
 * Everything on this panel is Google's own wording: the topic, the traffic band
 * it printed and the headlines it credited. When the feed cannot be read the
 * panel says so and shows the last topics it really did receive, dated - it
 * never presents an old list as a live one, and it never shows a number Google
 * did not publish.
 *
 * Under that sits RADAR's own ordering, and it is kept visibly separate. Google
 * hands over forty lines in the order its feed felt like; an editor needs to
 * know which of them is the same event, which has been searched all week, and
 * which appeared once. So each line carries a score with its parts and its
 * version printed beside it, related lines are folded into one group, and any
 * line can be opened to the days this server actually stored.
 */

const REASONS: Record<string, string> = {
  NO_FEED_FOR_GEO: 'Google publishes no trending-search list for this country, so there is nothing real to show here.',
  PROVIDER_ERROR: 'Google refused the request.',
  UNREACHABLE: 'The server could not reach Google just now.',
  TIMEOUT: 'Google took too long to answer.',
  UNREADABLE_FEED: 'Google sent a page instead of the feed - usually a consent or block screen.',
  EMPTY: 'Google reported no trending searches for this country right now.',
}

function describe(geo: TrendGeoRecord): string {
  if (geo.ok && geo.topics.length) return ''
  if (geo.ok) return REASONS.EMPTY
  const base = REASONS[geo.reason || ''] || 'The trending feed is not available.'
  return geo.status ? `${base} (HTTP ${geo.status})` : base
}

function clock(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString()
}

/** How long ago Google printed this, in the words a reader of the desk wants. */
function since(ageHours: number | null): string {
  if (ageHours === null || ageHours === undefined) return 'no date'
  if (ageHours < 1) return 'under an hour ago'
  if (ageHours < 24) return `${Math.round(ageHours)} h ago`
  return `${Math.round(ageHours / 24)} d ago`
}

/**
 * The score, with its parts.
 *
 * A single number that reorders the list would be the kind of claim this panel
 * has always refused to make, so the total only ever appears next to the three
 * figures that made it and the version of the arithmetic behind them.
 */
function ScoreLine({ score }: { score: TrendScore }) {
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
      <span className="font-bold text-slate-700">RADAR score {score.total.toFixed(2)}</span>
      <span>band {score.parts.traffic.toFixed(2)}</span>
      <span>repeat {score.parts.repeat.toFixed(2)}</span>
      <span>freshness {score.parts.freshness.toFixed(2)}</span>
      <span className="font-mono text-slate-400">{score.version}</span>
      {!score.onList && <span className="text-amber-700">off today&apos;s list</span>}
    </p>
  )
}

/**
 * The days one topic was really stored, drawn from the rows the feed wrote.
 *
 * A gap is left as a gap: a day this server never read the topic is not a day it
 * dropped to zero, and a line drawn through that missing day would be a picture
 * of a trend that did not happen.
 */
function HistoryPanel({ geo, topic }: { geo: string; topic: string }) {
  const [history, setHistory] = useState<TrendHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    adminAPI.getTrendHistory(geo, topic)
      .then((result) => { if (alive) setHistory(result) })
      .catch((err: any) => { if (alive) setError(err?.response?.data?.message || 'The stored days could not be read.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [geo, topic])

  if (loading) return <p className="mt-2 text-xs text-slate-500">Reading the days this server stored…</p>
  if (error) return <p className="mt-2 text-xs text-red-700">{error}</p>
  if (!history || history.reports.length === 0) {
    return <p className="mt-2 text-xs text-slate-500">{history?.note || 'This server has never read that topic off a feed, so there is nothing to show.'}</p>
  }

  const peaks = history.reports.map((row) => row.approxTraffic || 0)
  const top = Math.max(...peaks, 1)
  const points = history.reports
    .map((row, index) => `${(index / Math.max(history.reports.length - 1, 1)) * 100},${34 - ((row.approxTraffic || 0) / top) * 30}`)
    .join(' ')

  return (
    <div className="mt-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span className="font-bold text-slate-800">
          {history.reports.length} {history.reports.length === 1 ? 'day' : 'days'} stored · read {history.sightings} times in all
        </span>
        <span>Only the days the feed reported {history.topic} are drawn; a day it never reported is left out, not plotted as nothing.</span>
      </div>
      {history.reports.length > 1 && (
        <svg viewBox="0 0 100 36" className="mt-2 h-9 w-full" role="img" aria-label={`Traffic for ${history.topic} over ${history.reports.length} stored days`}>
          <polyline points={points} fill="none" stroke="#1d4ed8" strokeWidth="1.5" />
          {history.reports.map((row, index) => (
            <circle
              key={row.day}
              cx={(index / Math.max(history.reports.length - 1, 1)) * 100}
              cy={34 - ((row.approxTraffic || 0) / top) * 30}
              r="1.6"
              fill="#1d4ed8"
            />
          ))}
        </svg>
      )}
      <ul className="mt-1.5 divide-y divide-slate-200 text-xs">
        {history.reports.map((row) => (
          <li key={`${row.day}-${row.geo}`} className="flex flex-wrap items-center justify-between gap-2 py-1">
            <span className="font-mono text-slate-500">{row.day}</span>
            {/* The band is that day's own Google figure, exactly as printed. */}
            <span className="text-slate-700">{row.trafficLabel ? `${row.trafficLabel} searches` : 'no band printed'}</span>
            <span className="text-slate-500">read {row.sightings}×</span>
            {row.score && <span className="text-slate-500">score {row.score.total.toFixed(2)}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

function TopicRow({
  topic,
  geo,
  onUse,
  also = [],
}: {
  topic: TrendTopicRecord
  geo: string
  onUse?: (topic: string) => void
  also?: TrendTopicRecord[]
}) {
  const [open, setOpen] = useState(false)
  const [history, setHistory] = useState(false)
  const shared = topic.cluster?.shared || []

  return (
    <li className="px-5 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="min-w-0 flex-1 text-left"
          aria-expanded={open}
        >
          <span className="text-sm font-bold text-slate-900">{topic.topic}</span>
          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {/* The band is printed exactly as Google wrote it -"200+" is a band, not a count. */}
            {topic.trafficLabel && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-700">{topic.trafficLabel} searches</span>
            )}
            {topic.headlines.length > 0 && (
              <span>{topic.headlines.length} headline{topic.headlines.length > 1 ? 's' : ''} in Google&apos;s list</span>
            )}
            {topic.seenAt && <span>{clock(topic.seenAt)}</span>}
            {typeof topic.sightings === 'number' && topic.sightings > 1 && (
              <span>read {topic.sightings} times</span>
            )}
          </span>
          {topic.score && <ScoreLine score={topic.score} />}
          {/* The words that made the grouping, because a group the desk cannot
              question is a group the desk should not be steered by. */}
          {also.length > 0 && (
            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              <span className="rounded-full bg-blue-50 px-2 py-0.5 font-bold text-blue-700">
                {also.length + 1} spellings of this search
              </span>
              {shared.length > 0 && <span>on the words {shared.join(', ')}</span>}
            </span>
          )}
        </button>
        {onUse && (
          <button
            type="button"
            onClick={() => onUse(topic.topic)}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-50"
          >
            Write this story
          </button>
        )}
      </div>

      {open && (
        <div className="mt-2.5 flex flex-wrap gap-2 border-l-2 border-slate-100 pl-3">
          <button
            type="button"
            onClick={() => setHistory((value) => !value)}
            aria-expanded={history}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
          >
            <History className="h-3.5 w-3.5" />
            {history ? 'Hide the stored days' : `See the days since ${since(topic.score?.ageHours ?? null)}`}
          </button>
          <a
            href={topic.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-500 transition hover:bg-slate-50"
          >
            The feed this came from <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}

      {open && history && <HistoryPanel geo={geo} topic={topic.topic} />}

      {open && also.length > 0 && (
        <ul className="mt-2 border-l-2 border-slate-100 pl-3 text-xs text-slate-600">
          {also.map((line) => (
            <li key={line.topic} className="flex flex-wrap items-center gap-2 py-0.5">
              <span className="font-medium text-slate-800">{line.topic}</span>
              {line.trafficLabel && <span className="text-slate-500">{line.trafficLabel} searches</span>}
              {line.score && <span className="text-slate-500">score {line.score.total.toFixed(2)}</span>}
            </li>
          ))}
        </ul>
      )}

      {open && topic.headlines.length > 0 && (
        <ul className="mt-2.5 space-y-1.5 border-l-2 border-slate-100 pl-3">
          {topic.headlines.map((item) => (
            <li key={item.url} className="text-xs text-slate-600">
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer nofollow"
                className="font-medium text-slate-800 hover:text-blue-700 hover:underline"
              >
                {item.title || item.url}
              </a>
              <span className="ml-1.5 text-slate-400">— {item.source}</span>
            </li>
          ))}
        </ul>
      )}
      {open && topic.headlines.length === 0 && (
        <p className="mt-2 border-l-2 border-slate-100 pl-3 text-xs text-slate-500">
          Google gave no headlines for this one.{' '}
          <a href={topic.sourceUrl} target="_blank" rel="noreferrer" className="underline">
            Open the feed
          </a>
        </p>
      )}
    </li>
  )
}

/**
 * The list, folded by group.
 *
 * The strongest line of a group leads and carries its other spellings underneath
 * it; the rest of the group is not listed twice. Turning the folding off puts
 * every line back where Google printed it, which is what an editor needs the
 * first time they do not trust a grouping.
 */
function fold(topics: TrendTopicRecord[], grouped: boolean): { topic: TrendTopicRecord; also: TrendTopicRecord[] }[] {
  if (!grouped) return topics.map((topic) => ({ topic, also: [] }))
  const seen = new Set<string>()
  const rows: { topic: TrendTopicRecord; also: TrendTopicRecord[] }[] = []
  topics.forEach((topic) => {
    if (seen.has(topic.topic)) return
    const group = topic.cluster
      ? topics.filter((item) => item.cluster?.id === topic.cluster?.id && item.topic !== topic.topic)
      : []
    group.forEach((line) => seen.add(line.topic))
    seen.add(topic.topic)
    rows.push({ topic, also: group })
  })
  return rows
}

function summary(clusters: TrendCluster[] | undefined): string {
  if (!clusters || clusters.length === 0) return ''
  const lines = clusters.reduce((total, group) => total + group.size, 0)
  return `${clusters.length} ${clusters.length === 1 ? 'group' : 'groups'}, ${lines} lines folded`
}

export default function TrendRadar({ onUse }: { onUse?: (topic: string, geo: string) => void }) {
  const [data, setData] = useState<TrendRadarData | null>(null)
  const [geo, setGeo] = useState('')
  const [countrySearch, setCountrySearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [grouped, setGrouped] = useState(true)

  const load = useCallback(async (force: boolean, selectedGeo?: string) => {
    if (force) setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      const result = await adminAPI.getTrends(force, selectedGeo)
      setData(result)
      setGeo((current) => {
        if (selectedGeo) return selectedGeo
        const stillThere = result.geos.some((item) => item.geo === current)
        if (stillThere) return current
        const firstLive = result.geos.find((item) => item.topics.length > 0)
        return firstLive?.geo || result.geos[0]?.geo || ''
      })
    } catch (err: any) {
      setError(err?.response?.data?.message || 'The trending feed could not be read.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load(false)
  }, [load])

  const active = data?.geos.find((item) => item.geo === geo) || null
  const notice = active ? describe(active) : ''
  const rows = active ? fold(active.topics, grouped) : []

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="trend-radar-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <TrendingUp className="h-5 w-5" />
          </span>
          <div>
            <h2 id="trend-radar-heading" className="font-bold text-slate-900">
              What readers are searching
            </h2>
            <p className="text-xs text-slate-500">
              {data
                ? `Google Trends · ${data.liveRegions} of ${data.geos.length} regions answered · checked ${clock(data.checkedAt) || 'never'}${data.scoreVersion ? ` · ordered by our score ${data.scoreVersion}` : ''}`
                : 'Google Trends, read by the server'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className="h-4 w-4" />
          {refreshing ? 'Asking Google…' : 'Refresh'}
        </button>
      </div>

      {loading ? (
        <div className="space-y-3 p-5">
          {[1, 2, 3, 4].map((item) => <div key={item} className="h-12 animate-pulse rounded-lg bg-slate-100" />)}
        </div>
      ) : error ? (
        <p role="alert" className="m-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
      ) : !data || data.geos.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">No regions are being watched.</p>
      ) : (
        <>
          <div className="border-b border-slate-100 px-5 py-3">
            <label htmlFor="trend-country-search" className="mb-1.5 block text-xs font-bold text-slate-700">Explore trends by country</label>
            <input
              id="trend-country-search"
              list="trend-country-options"
              value={countrySearch}
              onChange={(event) => {
                const value = event.target.value
                setCountrySearch(value)
                const match = COUNTRIES.find((item) => item.code.toLowerCase() === value.trim().toLowerCase() || item.name.toLowerCase() === value.trim().toLowerCase())
                if (match) {
                  setGeo(match.code)
                  void load(false, match.code)
                }
              }}
              placeholder="Search any country, e.g. Rwanda or United States"
              autoComplete="off"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            <datalist id="trend-country-options">
              {COUNTRIES.map((item) => <option key={item.code} value={item.name}>{item.code}</option>)}
            </datalist>
            <p className="mt-1 text-[11px] text-slate-500">Search the full country directory. Google Trends availability varies by country; unavailable feeds are shown honestly.</p>
          </div>

          <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-5 py-3">
            {data.geos.map((item) => {
              const selected = item.geo === geo
              const live = item.topics.length > 0 && !item.stale
              return (
                <button
                  key={item.geo}
                  type="button"
                  onClick={() => setGeo(item.geo)}
                  aria-pressed={selected}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                    selected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${item.ok ? (item.stale ? 'bg-amber-400' : 'bg-emerald-500') : 'bg-red-400'}`} aria-hidden="true" />
                  {item.name}
                  {item.topics.length > 0 && <span className={selected ? 'text-blue-100' : 'text-slate-400'}>{item.topics.length}</span>}
                  {!live && !item.ok && <span className="sr-only">unavailable</span>}
                </button>
              )
            })}
          </div>

          {active?.stale && (
            <p className="mx-5 mt-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Google is not answering right now. These are the last topics actually received, on {clock(active.topics[0]?.lastSeenAt || '')} — not today&apos;s list.
              </span>
            </p>
          )}

          {notice && !active?.stale && (
            <p className="mx-5 mt-4 flex gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <span>
                {notice}
                {active?.sourceUrl && (
                  <>
                    {' '}
                    <a href={active.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold underline">
                      The address Google was asked <ExternalLink className="h-3 w-3" />
                    </a>
                  </>
                )}
              </span>
            </p>
          )}

          {active && active.topics.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-2.5">
              <button
                type="button"
                onClick={() => setGrouped((value) => !value)}
                aria-pressed={grouped}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                  grouped ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {grouped ? 'Spellings grouped' : 'Show every line Google printed'}
              </button>
              <span className="text-xs text-slate-500">
                {grouped && active.groupedLines ? `${active.groupedLines} line${active.groupedLines === 1 ? '' : 's'} folded — ${summary(active.clusters)}` : `${active.topics.length} lines, in the order they came`}
              </span>
            </div>
          )}

          {active && rows.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {rows.map(({ topic, also }) => (
                <TopicRow
                  key={topic.topic}
                  topic={topic}
                  geo={active.geo}
                  also={also}
                  onUse={onUse ? (value) => onUse(value, active.geo) : undefined}
                />
              ))}
            </ul>
          ) : !loading && !notice ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">Nothing to show for {active?.name} yet.</p>
          ) : null}

          <p className="border-t border-slate-100 px-5 py-3 text-[11px] text-slate-400">
            The band beside each line is Google&apos;s own, and the score under it is ours — {data.scoreVersion || 'the current version'}
            {' '}adds the size of Google&apos;s band, how many times this server has read the line, and how long ago, with the
            weight of each printed above so a ranking can be argued with. Cached for {data.cacheMinutes} minutes so Google is
            not asked on every look, and history covers the {data.historyDays || 21} days of feed readings kept. Topics are
            evidence for a headline, not a story in themselves — nothing here is published without an admin writing or
            approving it.
          </p>
        </>
      )}
      {refreshing && (
        <p className="flex items-center gap-2 border-t border-slate-100 px-5 py-2.5 text-xs text-slate-500">
          Re-reading {data?.geos.length || 0} regions from Google…
        </p>
      )}
    </section>
  )
}
