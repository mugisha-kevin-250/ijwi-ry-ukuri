import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, DollarSign, Loader2, RefreshCw, Wallet, XCircle } from 'lucide-react'
import { adminAPI } from '../../services/api'
import type { Payout } from '../../types'

const FILTERS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'paid', label: 'Paid' },
]

function statusBadge(status: Payout['status']): string {
  switch (status) {
    case 'approved': return 'bg-blue-50 text-blue-700'
    case 'paid': return 'bg-emerald-50 text-emerald-700'
    case 'rejected': return 'bg-red-50 text-red-700'
    default: return 'bg-amber-50 text-amber-700'
  }
}

// writerId is populated as an object by the admin endpoint, but the Payout type
// declares it as a string, so read it defensively to avoid runtime surprises.
function writerName(payout: any): string {
  const writer = payout?.writerId
  if (!writer) return 'Unknown writer'
  if (typeof writer === 'string') return 'Writer'
  return writer.fullName || writer.username || 'Unknown writer'
}

function writerHandle(payout: any): string {
  const writer = payout?.writerId
  if (writer && typeof writer === 'object' && writer.username) return `@${writer.username}`
  return ''
}

export default function AdminPayoutsPage() {
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [filter, setFilter] = useState('ALL')

  const loadPayouts = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await adminAPI.getPayouts()
      const payload = response.data.data as any
      setPayouts(Array.isArray(payload?.payouts) ? payload.payouts : (Array.isArray(payload) ? payload : []))
    } catch (err: any) {
      setError(err?.response?.data?.message || 'We could not load payouts. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPayouts()
  }, [loadPayouts])

  const runAction = async (id: string, action: 'approve' | 'reject' | 'paid') => {
    let reason: string | undefined
    if (action === 'reject') {
      const entered = window.prompt('Reason for rejecting this payout:')
      if (entered === null) return
      reason = entered.trim() || undefined
    }
    setBusyId(id)
    setActionError('')
    try {
      if (action === 'approve') await adminAPI.approvePayout(id)
      else if (action === 'reject') await adminAPI.rejectPayout(id, reason)
      else await adminAPI.markPayoutPaid(id)
      await loadPayouts()
    } catch (err: any) {
      setActionError(err?.response?.data?.message || 'That payout action could not be completed.')
    } finally {
      setBusyId(null)
    }
  }

  const visible = filter === 'ALL' ? payouts : payouts.filter((p) => p.status === filter)
  const pendingTotal = payouts.filter((p) => p.status === 'pending').reduce((sum, p) => sum + (p.amount || 0), 0)

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-blue-700">Finance</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">Creator payouts</h1>
          <p className="mt-1 text-sm text-slate-500">Review, approve and settle writer payment requests.</p>
        </div>
        <button type="button" onClick={() => void loadPayouts()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${filter === option.value ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {!loading && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">
            <Wallet className="h-3.5 w-3.5" />RWF {pendingTotal.toLocaleString()} awaiting approval
          </span>
        )}
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{error}</span>
          <button type="button" onClick={() => void loadPayouts()} className="font-bold underline">Retry</button>
        </div>
      )}
      {actionError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError('')} className="font-bold underline">Dismiss</button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="space-y-3 p-5">{[1, 2, 3, 4].map((item) => <div key={item} className="h-16 animate-pulse rounded-lg bg-slate-100" />)}</div>
        ) : visible.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <DollarSign className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">No payouts to show{filter !== 'ALL' ? ` for "${filter}"` : ''}.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visible.map((payout) => {
              const handle = writerHandle(payout)
              return (
                <div key={payout._id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">{writerName(payout)}</p>
                    <p className="text-xs text-slate-400">{handle ? `${handle} · ` : ''}Requested {new Date(payout.requestedAt).toLocaleDateString()}</p>
                    {payout.status === 'rejected' && payout.rejectionReason && (
                      <p className="mt-1 text-xs text-red-600">Reason: {payout.rejectionReason}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-extrabold tracking-tight text-slate-900">RWF {(payout.amount || 0).toLocaleString()}</p>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${statusBadge(payout.status)}`}>{payout.status}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {payout.status === 'pending' && (
                      <>
                        <button
                          type="button"
                          disabled={busyId === payout._id}
                          onClick={() => void runAction(payout._id, 'approve')}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
                        >
                          {busyId === payout._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Approve
                        </button>
                        <button
                          type="button"
                          disabled={busyId === payout._id}
                          onClick={() => void runAction(payout._id, 'reject')}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                        >
                          <XCircle className="h-3.5 w-3.5" />Reject
                        </button>
                      </>
                    )}
                    {payout.status === 'approved' && (
                      <button
                        type="button"
                        disabled={busyId === payout._id}
                        onClick={() => void runAction(payout._id, 'paid')}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-100 disabled:opacity-60"
                      >
                        {busyId === payout._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DollarSign className="h-3.5 w-3.5" />}Mark paid
                      </button>
                    )}
                    {(payout.status === 'paid' || payout.status === 'rejected') && (
                      <span className="text-xs font-semibold text-slate-400">No action needed</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
