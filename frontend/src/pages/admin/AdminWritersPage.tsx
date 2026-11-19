import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ExternalLink, PenLine, RefreshCw, X } from 'lucide-react'
import { adminAPI } from '../../services/api'
import type { WriterApplicationRecord } from '../../services/api'
import { useI18n } from '../../context/I18nContext'
import Avatar from '../../components/common/Avatar'
import { ConfirmDialog } from '../../components/common/Modal'

const FILTERS = ['pending', 'approved', 'rejected', 'suspended', 'all'] as const

const STATUS_STYLES: Record<WriterApplicationRecord['status'], string> = {
  pending: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-700',
  suspended: 'bg-slate-100 text-slate-600',
}

export default function AdminWritersPage() {
  const { t } = useI18n()
  const [applications, setApplications] = useState<WriterApplicationRecord[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [pending, setPending] = useState<WriterApplicationRecord | null>(null)
  const [approve, setApprove] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await adminAPI.getWriterRequests(filter)
      setApplications(result.applications)
      setPendingCount(result.pendingCount)
    } catch (err: any) {
      setError(err?.response?.data?.message || 'We could not load writer requests. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  const decide = async () => {
    const application = pending
    if (!application) return
    setBusyId(application._id)
    setActionError('')
    try {
      if (approve) await adminAPI.approveWriterRequest(application._id)
      else await adminAPI.rejectWriterRequest(application._id)
      setPending(null)
      await load()
    } catch (err: any) {
      setActionError(err?.response?.data?.message || (approve ? t('admin.writers.approveFailed') : t('admin.writers.rejectFailed')))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{t('admin.writers.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('admin.writers.desc')}</p>
          {pendingCount > 0 && (
            <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
              {pendingCount} {t('admin.writers.pending')}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setFilter(option)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${filter === option ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {t(`admin.writers.${option}`)}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{error}</span>
          <button type="button" onClick={() => void load()} className="font-bold underline">Retry</button>
        </div>
      )}
      {actionError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError('')} className="font-bold underline">Dismiss</button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl bg-slate-100" />)}
        </div>
      ) : applications.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-12 text-center shadow-sm">
          <PenLine className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">{t('admin.writers.empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {applications.map((application) => {
            const name = application.user?.fullName || application.fullName
            const username = application.user?.username || application.username
            const busy = busyId === application._id
            return (
              <article key={application._id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar
                      src={application.user?.avatar}
                      name={name || username}
                      className="h-10 w-10 shrink-0 bg-blue-600"
                      textClassName="text-sm font-medium text-white"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{name}</p>
                      <p className="truncate text-xs text-slate-500">
                        @{username}
                        {application.user?.email ? ` · ${application.user.email}` : ''}
                        {application.user?.country ? ` · ${application.user.country}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${STATUS_STYLES[application.status] || 'bg-slate-100 text-slate-600'}`}>
                      {t(`admin.writers.${application.status}`)}
                    </span>
                    {application.user?._id && (
                      <Link
                        to={`/mugishaimekevin/users/${application.user._id}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-50"
                      >
                        {t('admin.writers.openProfile')}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                </div>

                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">{t('admin.writers.reason')}</p>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-700">
                  {application.reasonForWriting?.trim() || t('admin.writers.noReason')}
                </p>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <p className="text-xs text-slate-400">
                    {t('admin.writers.applied')}{' '}
                    {application.createdAt ? new Date(application.createdAt).toLocaleDateString() : '—'}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => { setPending(application); setApprove(false) }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                    >
                      <X className="h-3.5 w-3.5" />
                      {t('admin.writers.reject')}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => { setPending(application); setApprove(true) }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-60"
                    >
                      <Check className="h-3.5 w-3.5" />
                      {t('admin.writers.approve')}
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!pending}
        onClose={() => setPending(null)}
        onConfirm={() => void decide()}
        title={`${approve ? t('admin.writers.approve') : t('admin.writers.reject')} — ${pending?.user?.fullName || pending?.fullName || ''}`}
        message={approve ? t('admin.writers.confirmApprove') : t('admin.writers.confirmReject')}
        confirmLabel={approve ? t('admin.writers.approve') : t('admin.writers.reject')}
        cancelLabel={t('profile.cancel')}
        variant={approve ? 'default' : 'destructive'}
        isLoading={!!busyId}
      />
    </div>
  )
}
