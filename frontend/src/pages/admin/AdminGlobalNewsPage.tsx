import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Globe2, RefreshCw, ShieldAlert, XCircle } from 'lucide-react'
import { apiClient, serverMessage } from '../../services/apiClient'

type Lead = { _id: string; title: string; link: string; sourceName: string; region: string; publishedAt?: string | null; reviewStatus: string }
type Status = { configuredFeeds: number; totalLeads: number; unreviewed: number; verified: number; lastFetchedAt?: string | null }

export default function AdminGlobalNewsPage() {
  const [status, setStatus] = useState<Status | null>(null)
  const [items, setItems] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [s, list] = await Promise.all([
        apiClient.get<any>('/global-news/status'),
        apiClient.get<any>('/global-news', { page: 1, limit: 50, status: 'unreviewed' }),
      ])
      setStatus(s.data as Status)
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
      setNotice(`Feed check finished: ${result.fetched || 0} leads read, ${result.saved || 0} new leads saved, ${result.failed || 0} feeds failed.`)
      await load()
    } catch (err) { setError(serverMessage(err, 'The feed refresh could not complete.')) }
    finally { setBusy('') }
  }
  const review = async (id: string, decision: 'verified' | 'rejected') => {
    setBusy(id); setError(''); setNotice('')
    try {
      await apiClient.patch(`/global-news/${id}/review`, { status: decision })
      setItems((current) => current.filter((item) => item._id !== id))
      setNotice(decision === 'verified' ? 'Lead marked verified. This does not publish it as a RADAR article.' : 'Lead rejected and removed from this queue.')
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
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Review source-attributed headlines collected from configured feeds. Verification is not publication; reporters must still produce original, checked coverage.</p>
        </div>
        <button onClick={() => void refresh()} disabled={!!busy || loading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${busy === 'refresh' ? 'animate-spin' : ''}`} /> Refresh configured feeds</button>
      </header>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Configured feeds', status?.configuredFeeds ?? '—'],
          ['Collected leads', status?.totalLeads ?? '—'],
          ['Awaiting review', status?.unreviewed ?? '—'],
          ['Marked verified', status?.verified ?? '—'],
        ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-2xl font-black text-slate-900">{value}</p></div>)}
      </section>
      {!status?.configuredFeeds && !loading && <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><ShieldAlert className="h-5 w-5 shrink-0" /><p>No feeds are configured. Add <code>GLOBAL_NEWS_FEEDS</code> to the backend environment as a JSON array of licensed or otherwise permitted HTTPS RSS/Atom feeds. Do not add private keys or credentials to GitHub.</p></div>}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-4 sm:px-5"><h2 className="font-bold text-slate-900">Unreviewed international leads</h2><p className="mt-1 text-xs text-slate-500">Marking a lead verified records an editorial decision only; it does not create or publish an article.</p></div>
        {loading ? <div className="space-y-3 p-5">{[1,2,3].map((x) => <div key={x} className="h-20 animate-pulse rounded-lg bg-slate-100" />)}</div> : !items.length ? <div className="p-10 text-center text-sm text-slate-500">No unreviewed leads in the queue.</div> : <ul className="divide-y divide-slate-100">{items.map((item) => <li key={item._id} className="flex min-w-0 flex-col gap-3 p-4 sm:p-5"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-blue-700">{item.sourceName} · {item.region}</p><h3 className="mt-1 break-words font-semibold leading-snug text-slate-900">{item.title}</h3><a href={item.link} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block break-all text-xs text-blue-700 underline">Open publisher source</a></div><div className="flex flex-wrap gap-2"><button disabled={!!busy} onClick={() => void review(item._id, 'verified')} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4" /> Mark verified</button><button disabled={!!busy} onClick={() => void review(item._id, 'rejected')} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-50"><XCircle className="h-4 w-4" /> Reject lead</button></div></li>)}</ul>}
      </section>
    </div>
  )
}
