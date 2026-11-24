import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Activity, RefreshCw, Search } from 'lucide-react'
import { adminAPI } from '../../services/api'
import type { AuditLogRecord } from '../../services/api'

function when(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString()
}

export default function AdminAuditLogPage() {
  const [items, setItems] = useState<AuditLogRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await adminAPI.getAuditLogs({ page, search: query })
      setItems(result.items)
      setTotal(result.total)
      setPages(result.totalPages)
    } catch (err: any) {
      setError(err?.response?.data?.message || 'The newsroom activity log could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [page, query])

  useEffect(() => { void load() }, [load])

  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    setPage(1)
    setQuery(search.trim())
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-blue-700">Newsroom accountability</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">Activity log</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">A chronological record of editorial status decisions. Entries are append-only and do not expose unpublished story text.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60">
          <RefreshCw className="h-4 w-4" />Refresh
        </button>
      </header>

      <form onSubmit={submitSearch} className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="audit-search">Search newsroom activity</label>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input id="audit-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search story, event or summary" className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        </div>
        <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800">Search</button>
      </form>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <span className="text-sm font-semibold text-slate-700">Recorded events</span>
          <span className="text-xs text-slate-500">{total.toLocaleString()} total</span>
        </div>
        {loading ? (
          <div className="space-y-3 p-5">{[1, 2, 3].map((n) => <div key={n} className="h-16 animate-pulse rounded-lg bg-slate-100" />)}</div>
        ) : items.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <Activity className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm font-semibold text-slate-700">No activity recorded yet</p>
            <p className="mt-1 text-xs text-slate-500">Editorial status changes will appear here as the newsroom works.</p>
          </div>
        ) : (
          <ol className="divide-y divide-slate-100">
            {items.map((item) => (
              <li key={item._id} className="flex gap-3 px-5 py-4">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700"><Activity className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{item.summary}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{item.entityLabel || item.entityType} · {item.actor?.fullName || item.actor?.username || 'System'}{item.actor?.role ? ` · ${item.actor.role}` : ''}</p>
                  {item.details?.note && <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">Editorial note: {item.details.note}</p>}
                </div>
                <time className="shrink-0 text-right text-xs text-slate-400">{when(item.createdAt)}</time>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">Page {page} of {pages}</p>
        <div className="flex gap-2">
          <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40">Previous</button>
          <button type="button" disabled={page >= pages || loading} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40">Next</button>
        </div>
      </div>
    </div>
  )
}
