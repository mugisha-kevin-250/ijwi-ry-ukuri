import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Timer, TriangleAlert } from 'lucide-react'
import { adminAPI, type SchedulerDesk, type SchedulerRunRecord } from '../../services/api'

/**
 * The scheduler desk.
 *
 * The clock publishes what the desk timed, takes the breaking label off the
 * stories that have aged out, assembles the radio bulletin and keeps the sports
 * page warm. Until this screen existed, all of that spoke only to the host's
 * log, which is a page nobody opens and a thing that is gone after a restart -
 * so "the six o'clock story never went out" had no answer.
 *
 * Everything here is what the server wrote down about its own run: the counts,
 * the milliseconds, and the thrown sentence without the stack. There are no
 * story titles on this page on purpose; it is a diagnostic, not a queue.
 */

const STATUS_STYLES: Record<string, string> = {
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
  skipped: 'bg-amber-50 text-amber-800 border-amber-200',
}

const STATUS_LABELS: Record<string, string> = {
  ok: 'Ran',
  failed: 'Failed',
  skipped: 'Did not start',
}

const JOB_LABELS: Record<string, string> = {
  publish: 'Publish what is due',
  breaking: 'Expire the breaking flags',
  radio: 'Assemble the bulletin',
  scores: 'Warm the scores page',
  'global-news': 'Refresh global news feeds',
  'weekly-pay': 'Close the pay week',
}

/** What a run reported, printed as the pairs a person reads rather than a dump. */
function didLine(did: SchedulerRunRecord['did']): string {
  if (!did) return ''
  const parts = Object.entries(did)
    .filter(([, value]) => typeof value !== 'boolean' || value === true)
    .map(([key, value]) => `${key} ${typeof value === 'boolean' ? 'yes' : value}`)
  return parts.join(' · ')
}

function ago(iso?: string | null): string {
  if (!iso) return 'never'
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(iso).toLocaleString()
}

export default function AdminSchedulerPage() {
  const [desk, setDesk] = useState<SchedulerDesk | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setDesk(await adminAPI.getSchedulerDesk())
    } catch (err: any) {
      setError(err?.response?.data?.message || 'We could not read the scheduler log. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * Press a job and show the answer.
   *
   * The log is re-read after every press, including a press that was refused,
   * because a refusal is also a row - a skipped pass is exactly the thing this
   * screen is for.
   */
  const press = async (job: string) => {
    setBusy(job)
    setNotice(null)
    try {
      const result = await adminAPI.runSchedulerJob(job)
      setNotice({ ok: result.ok, text: result.did ? `${result.message} · ${didLine(result.did)}` : result.message })
    } catch (err: any) {
      setNotice({
        ok: false,
        text: err?.response?.data?.message || 'We could not reach the scheduler to run that job.',
      })
    } finally {
      setBusy('')
      void load()
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-blue-700">Newsroom</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">Scheduled work</h1>
          <p className="mt-1 text-sm text-slate-500">
            What the server ran on its own clock, what it counted, and what it threw. The jobs finish work the
            lifecycle cannot leave to a person standing at a desk at midnight.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60">
          <RefreshCw className={`h-4 w-4${loading ? ' animate-spin' : ''}`} />Refresh
        </button>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{error}</span>
          <button type="button" onClick={() => void load()} className="font-bold underline">Retry</button>
        </div>
      )}

      {loading && !desk ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {[1, 2, 3].map((item) => <div key={item} className="h-10 animate-pulse rounded-lg bg-slate-100" />)}
        </div>
      ) : desk ? (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${desk.running ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                <Timer className="h-3.5 w-3.5" />
                {desk.running ? 'This server runs the clock' : 'This server does not run the clock'}
              </span>
              <span className={`rounded-full border px-3 py-1 text-xs font-bold ${desk.failuresToday > 0 ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                {desk.failuresToday} failed {desk.failuresToday === 1 ? 'run' : 'runs'} in the last 24 hours
              </span>
            </div>

            {!desk.running && (
              <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  ENABLE_SCHEDULER is off here, so nothing below runs by itself. The buttons still work, because a
                  person pressing one is a decision rather than a schedule.
                </span>
              </p>
            )}

            <p className="mt-3 text-sm text-slate-600">
              Times are read on <span className="font-semibold">{desk.timezone}</span>. {desk.stored} runs are stored,
              and anything older than {desk.keepDays} days is dropped - this is a diagnostic, not an archive.
            </p>
          </section>

          {notice && (
            <p role="status" className={`rounded-lg border px-4 py-3 text-sm ${notice.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
              {notice.text}
            </p>
          )}

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-3">
              <h2 className="text-sm font-bold text-slate-900">The jobs</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Run now is safe to press twice: a job that is still going says so instead of starting a second one,
                and publishing only moves stories an editor has already approved and timed.
              </p>
            </div>
            <ul className="divide-y divide-slate-100">
              {desk.jobs.map((job) => (
                <li key={job.name} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {JOB_LABELS[job.name] || job.name}
                      <span className="ml-2 font-mono text-xs font-normal text-slate-500">{job.every}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">{job.summary}</p>
                    {job.last ? (
                      <p className="mt-1 text-xs text-slate-600">
                        last {ago(job.last.at)}
                        {job.last.ms ? ` · ${job.last.ms} ms` : ''}
                        {job.last.did ? ` · ${didLine(job.last.did)}` : ''}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-400">Nothing on record yet since this log started.</p>
                    )}
                    {job.last?.error && (
                      <p className="mt-1 break-words text-xs text-red-700">{job.last.error}</p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {job.last && (
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLES[job.last.status] || 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                        {STATUS_LABELS[job.last.status] || job.last.status}
                      </span>
                    )}
                    {job.manual ? (
                      <button
                        type="button"
                        onClick={() => void press(job.name)}
                        disabled={busy !== ''}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
                      >
                        {busy === job.name ? 'Running…' : 'Run now'}
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400">not a button</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-3">
              <h2 className="text-sm font-bold text-slate-900">Recent runs</h2>
              <p className="mt-0.5 text-xs text-slate-500">Newest first. A press from this screen is marked admin; a tick from the clock is marked cron.</p>
            </div>
            {desk.runs.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-500">
                Nothing has been recorded since this log started. Run a job above, or wait for the next five-minute
                tick, and it will appear here.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {desk.runs.map((run, index) => (
                  <li key={`${run.createdAt}-${index}`} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">
                        {JOB_LABELS[run.job] || run.job}
                        <span className="ml-2 text-[11px] font-normal uppercase tracking-wide text-slate-400">{run.trigger}</span>
                      </p>
                      {run.did && <p className="mt-0.5 text-xs text-slate-500">{didLine(run.did)}</p>}
                      {run.error && <p className="mt-1 break-words text-xs text-red-700">{run.error}</p>}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLES[run.status] || 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                        {STATUS_LABELS[run.status] || run.status}
                      </span>
                      <span className="text-[11px] text-slate-400">{ago(run.createdAt)}{run.ms ? ` · ${run.ms} ms` : ''}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}
