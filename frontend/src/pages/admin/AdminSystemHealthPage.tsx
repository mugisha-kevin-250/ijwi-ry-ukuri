import { useCallback, useEffect, useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, Database, RefreshCw, Server } from 'lucide-react'
import { apiClient, serverMessage } from '../../services/apiClient'

type Health = {
  commit: string | null
  database: { connected: boolean }
  wired: Record<string, boolean | string | null>
}
type Readiness = { success: boolean; status: string; database: boolean }
type Storage = { capacityMB: number; usedMB: number; remainingMB: number; usedPercent: number; uploadStorage: { capacityMB: number; usedMB: number; remainingMB: number; usedPercent: number; files: number }; measuredAt: string; cleanup?: { deletedStories?: number; deletedImages?: number; freedImageMB?: number; after?: { usedPercent?: number } } | null }

function State({ ok, yes = 'Available', no = 'Not configured' }: { ok: boolean; yes?: string; no?: string }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
    {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
    {ok ? yes : no}
  </span>
}

export default function AdminSystemHealthPage() {
  const [health, setHealth] = useState<Health | null>(null)
  const [readiness, setReadiness] = useState<Readiness | null>(null)
  const [storage, setStorage] = useState<Storage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [checkedAt, setCheckedAt] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [healthResponse, readyResponse, storageResponse] = await Promise.all([
        apiClient.get('/health'),
        apiClient.get('/health/ready'),
        apiClient.get('/admin/system/storage'),
      ])
      setHealth(healthResponse.data as unknown as Health)
      setReadiness(readyResponse.data as unknown as Readiness)
      setStorage(((storageResponse.data as any)?.data || storageResponse.data) as Storage)
      setCheckedAt(new Date())
    } catch (err) {
      setError(serverMessage(err, 'The backend health checks could not be reached.'))
      setReadiness(null)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const integrations = [
    ['Transactional email', health?.wired.email === true, health?.wired.emailReason],
    ['Web push notifications', health?.wired.push === true, null],
    ['AI writing and research', health?.wired.ai === true, null],
    ['Weather provider', health?.wired.weather === true, null],
    ['Google translation', health?.wired.translate === true, null],
  ] as const

  return (
    <main className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-700">Platform operations</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-extrabold text-slate-900"><Activity className="h-6 w-6" /> System health</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Check whether the API is reachable, MongoDB is responding, and key integrations are configured. This page never displays secret values.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh checks</button>
      </header>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}<button onClick={() => void load()} className="ml-2 font-bold underline">Retry</button></div>}

      <section className="grid gap-3 sm:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-600"><Server className="h-4 w-4" /> API process</div>
          <div className="mt-3"><State ok={!!health} yes="Responding" no={loading ? 'Checking' : 'Unavailable'} /></div>
          <p className="mt-3 break-all text-xs text-slate-500">Commit: {health?.commit || 'Not supplied by hosting provider'}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-600"><Database className="h-4 w-4" /> Database readiness</div>
          <div className="mt-3"><State ok={readiness?.database === true} yes="MongoDB ping succeeded" no={loading ? 'Checking' : 'Not ready'} /></div>
          <p className="mt-3 text-xs text-slate-500">Readiness endpoint: /api/health/ready</p>
        </article>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="font-bold text-slate-900">MongoDB storage</h2><p className="mt-1 text-xs text-slate-500">Logical database usage against the configured storage allowance. Set MONGODB_STORAGE_LIMIT_MB in Render to match your Atlas tier.</p></div>
          <State ok={!!storage && storage.usedPercent < 60} yes="Below 60% safety limit" no={storage ? 'At or above 60% limit' : 'Unavailable'} />
        </div>
        {storage ? <>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <div><p className="text-xs text-slate-500">Used</p><p className="text-xl font-extrabold text-slate-900">{storage.usedMB} MB</p></div>
            <div><p className="text-xs text-slate-500">Remaining</p><p className="text-xl font-extrabold text-slate-900">{storage.remainingMB} MB</p></div>
            <div><p className="text-xs text-slate-500">Capacity</p><p className="text-xl font-extrabold text-slate-900">{storage.capacityMB} MB</p></div>
            <div><p className="text-xs text-slate-500">Usage</p><p className="text-xl font-extrabold text-slate-900">{storage.usedPercent}%</p></div>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${storage.usedPercent >= 60 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, storage.usedPercent)}%` }} /></div>
          <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-600">
            <p className="font-semibold">Uploaded media: {storage.uploadStorage.usedMB} / {storage.uploadStorage.capacityMB} MB ({storage.uploadStorage.usedPercent}%) · {storage.uploadStorage.files} files · {storage.uploadStorage.remainingMB} MB remaining</p>
            <p className="mt-1">Auto cleanup starts above 60% and targets 55%. It only considers non-owner published stories older than 180 days with no comments and at most 25 views.</p>
            {storage.cleanup && <p className="mt-1">Last cleanup: {storage.cleanup.deletedStories || 0} stories and {storage.cleanup.deletedImages || 0} images removed; {storage.cleanup.freedImageMB || 0} MB of image data freed.</p>}
            <p className="mt-1 text-slate-500">Measured: {new Date(storage.measuredAt).toLocaleString()}. MongoDB may retain allocated disk pages after document deletion; this is logical usage, not a guaranteed reduction in Atlas physical disk allocation.</p>
          </div>
        </> : <p className="mt-3 text-sm text-slate-500">{loading ? 'Reading MongoDB storage usage…' : 'Storage metrics are unavailable.'}</p>}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
          <h2 className="font-bold text-slate-900">Integration configuration</h2>
          <p className="mt-1 text-xs text-slate-500">Configured does not guarantee that a provider is currently delivering successfully. Check provider dashboards and logs for delivery status.</p>
        </div>
        <ul className="divide-y divide-slate-100">
          {integrations.map(([name, configured, detail]) => <li key={name} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="min-w-0"><p className="text-sm font-semibold text-slate-800">{name}</p>{detail && <p className="mt-1 break-words text-xs text-slate-500">{detail}</p>}</div>
            <State ok={configured} />
          </li>)}
        </ul>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <h2 className="font-bold">Backups are not verified by this page</h2>
        <p className="mt-1 leading-relaxed">A successful database health check is not a backup. Confirm Atlas backup status, retention, and the latest restore drill using the production operations runbook. Never store database exports in the public repository.</p>
        <p className="mt-2 text-xs font-semibold">Last check: {checkedAt ? checkedAt.toLocaleString() : 'Not checked yet'}</p>
      </section>
    </main>
  )
}
