import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ExternalLink, RefreshCw, TrendingUp } from 'lucide-react'
import { adminAPI, type TrendGeoRecord, type TrendRadar as TrendRadarData, type TrendTopicRecord } from '../../services/api'

/**
 * The searches Google reports for the regions this newsroom writes about.
 *
 * Everything on this panel is Google's own wording: the topic, the traffic band
 * it printed and the headlines it credited. When the feed cannot be read the
 * panel says so and shows the last topics it really did receive, dated - it
 * never presents an old list as a live one, and it never shows a number Google
 * did not publish.
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

function TopicRow({ topic, onUse }: { topic: TrendTopicRecord; onUse?: (topic: string) => void }) {
  const [open, setOpen] = useState(false)
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
          </span>
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

export default function TrendRadar({ onUse }: { onUse?: (topic: string, geo: string) => void }) {
  const [data, setData] = useState<TrendRadarData | null>(null)
  const [geo, setGeo] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (force: boolean) => {
    if (force) setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      const result = await adminAPI.getTrends(force)
      setData(result)
      setGeo((current) => {
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
                ? `Google Trends · ${data.liveRegions} of ${data.geos.length} regions answered · checked ${clock(data.checkedAt) || 'never'}`
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

          {active && active.topics.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {active.topics.map((topic) => (
                <TopicRow
                  key={`${topic.topic}-${topic.seenAt || ''}`}
                  topic={topic}
                  onUse={onUse ? (value) => onUse(value, active.geo) : undefined}
                />
              ))}
            </ul>
          ) : !loading && !notice ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">Nothing to show for {active?.name} yet.</p>
          ) : null}

          <p className="border-t border-slate-100 px-5 py-3 text-[11px] text-slate-400">
            Cached for {data.cacheMinutes} minutes so Google is not asked on every look. Topics are evidence for a
            headline, not a story in themselves — nothing here is published without an admin writing or approving it.
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
