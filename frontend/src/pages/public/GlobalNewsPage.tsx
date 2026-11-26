import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { writerAPI } from '../../services/api'
import { AlertCircle, Clock3, ExternalLink, Globe2, RefreshCw } from 'lucide-react'
import { apiClient, serverMessage } from '../../services/apiClient'

type GlobalNewsLead = {
  _id: string
  title: string
  description?: string
  imageUrl?: string
  imageCredit?: string
  imageCaption?: string
  link: string
  sourceName: string
  region: string
  language: string
  publishedAt: string | null
  fetchedAt: string
  reviewStatus: string
}
type FeedResponse = { items: GlobalNewsLead[]; page: number; pages: number; total: number }

const REGIONS = [
  ['','All regions'], ['RW','Rwanda'], ['AFRICA','Africa'], ['GB','United Kingdom'],
  ['US','United States'], ['IN','India'], ['FR','France'], ['DE','Germany'],
  ['WORLD','World'],
] as const

function dateLabel(value?: string | null) {
  if (!value) return 'Recently collected'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Recently collected' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export default function GlobalNewsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const canWrite = ['WRITER', 'EDITOR', 'ADMIN', 'MANAGING_EDITOR', 'NEWS_EDITOR'].includes(String(user?.role || '').toUpperCase())
  const [region, setRegion] = useState('')
  const [search, setSearch] = useState('')
  const [drafting, setDrafting] = useState('')
  const [actionError, setActionError] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<FeedResponse>({ items: [], page: 1, pages: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await apiClient.get<FeedResponse>('/global-news', { page, limit: 24, region, search: search.trim() })
      const data = response.data as unknown as FeedResponse
      setResult({ items: Array.isArray(data.items) ? data.items : [], page: data.page || page, pages: data.pages || 0, total: data.total || 0 })
      setUpdatedAt(new Date())
    } catch (err) {
      setError(serverMessage(err, 'Global headlines could not be loaded. Please try again.'))
    } finally { setLoading(false) }
  }, [page, region, search])

  useEffect(() => { void load() }, [load])

  const changeRegion = (value: string) => { setRegion(value); setPage(1) }

  const createWriterDraft = async (id: string) => {
    setDrafting(id); setActionError('')
    try {
      const response: any = await writerAPI.createGlobalNewsDraft(id)
      const article = response?.data?.data?.article
      if (!article?._id) throw new Error('The server did not return the new draft.')
      navigate(`/writer/articles/${article._id}/edit`)
    } catch (err: any) {
      setActionError(err?.response?.data?.message || err.message || 'Could not create a writer draft.')
    } finally { setDrafting('') }
  }

  return (
    <main className="container-custom py-6 sm:py-10">
      <section className="overflow-hidden rounded-2xl bg-slate-950 text-white shadow-lg">
        <div className="relative px-5 py-8 sm:px-8 sm:py-12">
          <div className="absolute -right-12 -top-16 h-56 w-56 rounded-full bg-blue-500/20 blur-3xl" aria-hidden="true" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-blue-100">
                <Globe2 className="h-4 w-4" /> RADAR WORLD DESK
              </div>
              <h1 className="mt-4 text-3xl font-black leading-tight sm:text-5xl">The world, in view.</h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">
                International headlines collected from configured news feeds, with links back to their publishers.
              </p>
            </div>
            <button onClick={() => void load()} disabled={loading} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh headlines
            </button>
          </div>
          <div className="relative mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-300">
            <span>{result.total.toLocaleString()} collected headlines</span>
            {updatedAt && <span>Page refreshed {dateLabel(updatedAt.toISOString())}</span>}
            <span>Feed leads are not independently verified reporting</span>
          </div>
        </div>
      </section>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text)]">Latest from around the world</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Choose a region to narrow the headlines.</p>
        </div>
        <label className="flex w-full items-center gap-2 text-sm font-medium text-[var(--color-text)] sm:w-auto">
          <span className="shrink-0">Search</span>
          <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Search headlines, topics or publishers" className="min-h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm sm:w-64" />
        </label>
        <label className="flex w-full items-center gap-2 text-sm font-medium text-[var(--color-text)] sm:w-auto">
          <span className="shrink-0">Region</span>
          <select value={region} onChange={(event) => changeRegion(event.target.value)} className="min-h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm sm:w-52">
            {REGIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>

      {actionError && <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{actionError}</div>}
      {error && <div role="alert" className="mt-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div className="min-w-0"><p className="font-semibold">The world desk is temporarily unavailable.</p><p className="mt-1">{error}</p><button onClick={() => void load()} className="mt-2 font-bold underline">Try again</button></div></div>}

      {loading && !result.items.length ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading headlines">
          {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-44 animate-pulse rounded-xl border border-[var(--color-border)] bg-[var(--color-brand-light)]/40" />)}
        </div>
      ) : !loading && !result.items.length ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[var(--color-border)] px-5 py-12 text-center">
          <Globe2 className="mx-auto h-9 w-9 text-[var(--color-text-muted)]" />
          <h3 className="mt-3 font-bold text-[var(--color-text)]">No global headlines yet</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--color-text-muted)]">The newsroom must configure permitted RSS or Atom feeds on the backend before international headlines can appear here.</p>
          <Link to="/about" className="mt-4 inline-flex font-semibold text-[var(--color-brand-text)]">About RADAR</Link>
        </div>
      ) : (
        <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {result.items.map((item) => (
            <article key={item._id} className="flex min-w-0 flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--color-brand-text)]">
                <span>{item.region || 'WORLD'}</span><span aria-hidden="true">•</span><span>{item.sourceName}</span>
              </div>
              {item.imageUrl && <img src={item.imageUrl} alt={item.imageCaption || item.title} loading="lazy" referrerPolicy="no-referrer" className="mt-3 aspect-video w-full rounded-lg object-cover" />}
              <h3 className="mt-3 flex-1 text-base font-bold leading-snug text-[var(--color-text)] sm:text-lg">{item.title}</h3>
              {item.description && <p className="mt-2 line-clamp-3 text-sm text-[var(--color-text-muted)]">{item.description}</p>}
              {item.imageCredit && <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">Image: {item.imageCredit}</p>}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3">
                <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]"><Clock3 className="h-3.5 w-3.5" />{dateLabel(item.publishedAt || item.fetchedAt)}</span>
                <div className="flex flex-wrap items-center gap-2">
                  {canWrite && <button type="button" onClick={() => void createWriterDraft(item._id)} disabled={!!drafting} className="inline-flex min-h-10 items-center rounded-lg bg-blue-700 px-3 text-xs font-bold text-white disabled:opacity-50">{drafting === item._id ? 'Creating draft…' : 'Create my RADAR draft'}</button>}
                  <a href={item.link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[var(--color-brand-light)] px-3 text-xs font-bold text-[var(--color-brand-text)] hover:underline">Read at source <ExternalLink className="h-3.5 w-3.5" /></a>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="mt-7 flex flex-col items-center justify-between gap-3 border-t border-[var(--color-border)] pt-5 sm:flex-row">
        <p className="text-xs text-[var(--color-text-muted)]">Showing {result.items.length} of {result.total.toLocaleString()} headlines</p>
        <div className="flex w-full gap-2 sm:w-auto">
          <button disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} className="min-h-11 flex-1 rounded-lg border border-[var(--color-border)] px-4 text-sm font-semibold disabled:opacity-40 sm:flex-none">Previous</button>
          <span className="flex min-h-11 items-center px-2 text-xs text-[var(--color-text-muted)]">Page {page} of {Math.max(1, result.pages)}</span>
          <button disabled={page >= result.pages || loading} onClick={() => setPage((value) => value + 1)} className="min-h-11 flex-1 rounded-lg border border-[var(--color-border)] px-4 text-sm font-semibold disabled:opacity-40 sm:flex-none">Next</button>
        </div>
      </div>
      <p className="mt-5 text-xs leading-relaxed text-[var(--color-text-muted)]">RADAR displays headline metadata and publisher links. Feed items are leads for newsroom review; inclusion here does not mean RADAR has independently verified the claim.</p>
    </main>
  )
}
