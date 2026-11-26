import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Globe2, RefreshCw, ShieldAlert, XCircle } from 'lucide-react'
import { apiClient, serverMessage } from '../../services/apiClient'

type Lead = { _id: string; title: string; englishTitle?: string; description?: string; englishDescription?: string; imageUrl?: string; link: string; sourceName: string; region: string; language?: string; publishedAt?: string | null; reviewStatus: string }
type Status = { configuredFeeds: number; worldNewsApiConfigured?: boolean; worldNewsApiLastSuccessAt?: string | null; worldNewsApiQuotaLeft?: string | null; worldNewsApiLastError?: string | null; totalLeads: number; unreviewed: number; verified: number; lastFetchedAt?: string | null }

export default function AdminGlobalNewsPage() {
  const [status, setStatus] = useState<Status | null>(null)
  const [items, setItems] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [draftCreated, setDraftCreated] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [s, list] = await Promise.all([
        apiClient.get<any>('/global-news/status'),
        apiClient.get<any>('/global-news/queue', { page: 1, limit: 50 }),
      ])
      setStatus(s.data as unknown as Status)
      setItems((list.data as any).items || [])
    } catch (err) { setError(serverMessage(err, 'Could not load the global news desk.')) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const refresh = async () => {
    setBusy('refresh'); setNotice(''); setError('')
    try {
      const response = await apiClient.post<any>('/global-news/refresh', {})
      const result = (response.data as any).result || {}
      const api = result.worldNewsApi || {};
      setNotice(`News refresh finished: ${result.fetched || 0} headlines read, ${result.saved || 0} new leads saved, ${result.failed || 0} source errors.${api.skipped && api.configured ? ' World News API is waiting for its quota-safe refresh window.' : api.error ? ` World News API: ${api.error}.` : api.configured ? ' World News API checked successfully.' : ' World News API is not configured.'}`)
      await load()
    } catch (err) { setError(serverMessage(err, 'The feed refresh could not complete.')) }
    finally { setBusy('') }
  }
  const review = async (id: string, decision: 'verified' | 'rejected') => {
    setBusy(id); setError(''); setNotice(''); setDraftCreated(false)
    try {
      const response = await apiClient.post<any>(`/global-news/${id}/review`, { status: decision })
      const result = response.data as any
      setItems((current) => current.filter((item) => item._id !== id))
      setDraftCreated(decision === 'verified')
      setNotice(decision === 'verified' ? `Draft created: “${result?.article?.title || 'English RADAR report'}”. It is saved as an unpublished draft and is ready for editorial review.` : 'Lead rejected and removed from this queue.')
      await load()
    } catch (err) { setError(serverMessage(err, 'Could not save the review decision.')) }
    finally { setBusy('') }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-700">International desk</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-extrabold text-slate-900"><Globe2 className="h-6 w-6" /> Global news intelligence</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Review international leads in English. Verifying a lead asks RADAR AI to create an original, source-attributed article draft in the World section. Drafts are never published automatically.</p>
        </div>
        <button onClick={() => void refresh()} disabled={!!busy || loading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${busy === 'refresh' ? 'animate-spin' : ''}`} /> Refresh international news</button>
      </header>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><p>{notice}</p>{draftCreated && <a href="/mugishaimekevin/ai-writer" className="mt-2 inline-block font-bold underline">Open AI draft review queue</a>}</div>}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['World News API', status ? (status.worldNewsApiConfigured ? 'Configured' : 'Not configured') : '—'],
          ['RSS / Atom feeds', status?.configuredFeeds ?? '—'],
          ['Collected leads', status?.totalLeads ?? '—'],
          ['Awaiting review', status?.unreviewed ?? '—'],
          ['Marked verified', status?.verified ?? '—'],
        ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-2xl font-black text-slate-900">{value}</p></div>)}
      </section>
      {!loading && status && !status.worldNewsApiConfigured && !status.configuredFeeds && <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><ShieldAlert className="h-5 w-5 shrink-0" /><p>No international news source is configured. Add <code>WORLD_NEWS_API_KEY</code> to the backend environment to enable World News API, or optionally configure <code>WORLD_NEWS_FEEDS</code> with permitted HTTPS RSS/Atom feeds. Keep API keys on the backend only, never in frontend code or GitHub.</p></div>}
      {status?.worldNewsApiConfigured && status.worldNewsApiLastError && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">World News API reported: <strong>{status.worldNewsApiLastError}</strong>. Check the backend service logs and API quota/key configuration.</div>}
      {status?.worldNewsApiConfigured && <p className="text-xs text-slate-500">World News API last successful sync: {status.worldNewsApiLastSuccessAt ? new Date(status.worldNewsApiLastSuccessAt).toLocaleString() : 'Not yet synced'}{status.worldNewsApiQuotaLeft ? ` · Quota remaining: ${status.worldNewsApiQuotaLeft}` : ''}</p>}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-4 sm:px-5"><h2 className="font-bold text-slate-900">Unreviewed international leads</h2><p className="mt-1 text-xs text-slate-500">Verify & create draft generates an English RADAR report from the available headline and excerpt. It saves to Top Stories as a draft; an editor must check the facts, image rights and copy before publication.</p></div>
        {loading ? <div className="space-y-3 p-5">{[1,2,3].map((x) => <div key={x} className="h-20 animate-pulse rounded-lg bg-slate-100" />)}</div> : !items.length ? <div className="p-10 text-center text-sm text-slate-500">No unreviewed leads in the queue.</div> : <ul className="divide-y divide-slate-100">{items.map((item) => <li key={item._id} className="flex min-w-0 flex-col gap-3 p-4 sm:p-5"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-blue-700">{item.sourceName} · {item.region} · Source language: {(item.language || 'unknown').toUpperCase()}</p><h3 className="mt-1 break-words font-semibold leading-snug text-slate-900">{item.englishTitle || item.title}</h3>{item.englishTitle && item.englishTitle !== item.title && <p className="mt-1 text-xs text-slate-400">Original: {item.title}</p>}
            {(item.englishDescription || item.description) && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-600">{item.englishDescription || item.description}</p>}
            {item.imageUrl && <img src={item.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="mt-3 h-28 w-44 rounded-lg object-cover" />}
            <a href={item.link} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block break-all text-xs text-blue-700 underline">Open publisher source</a></div><div className="flex flex-wrap gap-2"><button disabled={!!busy} onClick={() => void review(item._id, 'verified')} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4" /> {busy === item._id ? 'Creating draft…' : 'Verify & create draft'}</button><button disabled={!!busy} onClick={() => void review(item._id, 'rejected')} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-50"><XCircle className="h-4 w-4" /> Reject lead</button></div></li>)}</ul>}
      </section>
    </div>
  )
}
