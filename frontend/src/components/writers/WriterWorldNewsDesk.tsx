import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock3, ExternalLink, Globe2, Search, RefreshCw, FilePenLine } from 'lucide-react'
import { writerAPI } from '../../services/api'
import { apiClient, serverMessage } from '../../services/apiClient'

type Lead = {
  _id: string
  title: string
  description?: string
  imageUrl?: string
  imageCredit?: string
  link: string
  sourceName: string
  region?: string
  publishedAt?: string | null
  fetchedAt?: string
}
type Feed = { items?: Lead[]; total?: number; pages?: number }

function dateLabel(value?: string | null) {
  if (!value) return 'Recently collected'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Recently collected' : date.toLocaleString()
}

/**
 * A small World Desk embedded in the writer's own dashboard. Saving a lead
 * creates an editable draft owned by the writer; it never republishes source
 * copy or bypasses the normal review/publishing workflow.
 */
export default function WriterWorldNewsDesk() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<Lead[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await apiClient.get<Feed>('/global-news', { page: 1, limit: 6, search: search.trim() })
      const data = response.data as unknown as Feed
      setItems(Array.isArray(data.items) ? data.items : [])
      setTotal(Number(data.total || 0))
    } catch (err) {
      setError(serverMessage(err, 'World News could not be loaded. Try again.'))
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, search ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [load, search])

  const saveLead = async (id: string) => {
    setCreating(id)
    setError('')
    setNotice('')
    try {
      const response: any = await writerAPI.createGlobalNewsDraft(id)
      const article = response?.data?.data?.article
      if (!article?._id) throw new Error('The server did not return a writer draft.')
      setNotice('Saved as your editable draft. Review the facts, source and image before submitting or publishing.')
      navigate(`/writer/articles/${article._id}/edit`)
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'This lead could not be saved as a draft.')
    } finally {
      setCreating('')
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950 px-5 py-4 text-white">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-200"><Globe2 className="h-4 w-4" /> RADAR World Desk</div>
          <h2 className="mt-1 text-lg font-extrabold">Find your next story</h2>
          <p className="mt-1 text-xs text-slate-300">Search global headlines, open the source, or save a lead into your own drafts.</p>
        </div>
        <a href="/global-news" className="text-xs font-bold text-blue-200 hover:underline">Open full World Desk <ExternalLink className="inline h-3 w-3" /></a>
      </div>

      <div className="p-4 sm:p-5">
        <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--color-border)] px-3">
          <Search className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search topics, headlines or publishers…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" aria-label="Search World News" />
          <button type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh World News" className="rounded-lg p-2 text-[var(--color-text-muted)] hover:bg-slate-100 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </label>

        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-xs font-medium text-red-700">{error}</p>}
        {notice && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs font-medium text-emerald-800">{notice}</p>}

        {loading && !items.length ? (
          <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">Loading global headlines…</p>
        ) : !items.length ? (
          <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">No matching headlines. Try another search.</p>
        ) : (
          <div className="mt-3 divide-y divide-[var(--color-border)]">
            {items.map((item) => (
              <article key={item._id} className="flex gap-3 py-4">
                {item.imageUrl && <img src={item.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-24 w-28 shrink-0 rounded-lg object-cover sm:h-28 sm:w-40" />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wide text-[var(--color-brand-text)]"><span>{item.region || 'WORLD'}</span><span>·</span><span>{item.sourceName}</span></div>
                  <h3 className="mt-1 text-sm font-bold leading-snug text-[var(--color-text)]">{item.title}</h3>
                  {item.description && <p className="mt-1 line-clamp-2 text-xs text-[var(--color-text-muted)]">{item.description}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-[var(--color-text-muted)]"><span><Clock3 className="mr-1 inline h-3 w-3" />{dateLabel(item.publishedAt || item.fetchedAt)}</span>{item.imageCredit && <span>Image: {item.imageCredit}</span>}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void saveLead(item._id)} disabled={!!creating} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-blue-700 px-3 text-xs font-bold text-white disabled:opacity-50"><FilePenLine className="h-3.5 w-3.5" />{creating === item._id ? 'Saving draft…' : 'Save to my drafts'}</button>
                    <a href={item.link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 text-xs font-semibold text-[var(--color-text)] hover:bg-slate-50">View source <ExternalLink className="h-3 w-3" /></a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-text-muted)]">
          <span>{total.toLocaleString()} headlines available · showing up to 6</span>
          <a href="/global-news" className="font-bold text-[var(--color-brand-text)] hover:underline">Search all headlines</a>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--color-text-muted)]">World News entries are research leads, not verified RADAR articles. Saving creates a private draft; check facts, source attribution and image reuse rights before submitting it for publication.</p>
      </div>
    </section>
  )
}
