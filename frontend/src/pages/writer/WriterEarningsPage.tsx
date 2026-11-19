import { useEffect, useState } from 'react'
import { writerAPI } from '../../services/api'
import { useI18n } from '../../context/I18nContext'
import { DollarSign, TrendingUp, Clock, CheckCircle, XCircle } from 'lucide-react'
import { SkeletonBlock } from '../../components/common/Skeleton'

export default function WriterEarningsPage() {
  const { t } = useI18n()
  const [earnings, setEarnings] = useState<any[]>([])
  const [payouts, setPayouts] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const [earningsRes, payoutsRes, dashboardRes] = await Promise.all([
          writerAPI.getEarnings(),
          writerAPI.getPayouts(),
          writerAPI.getDashboard(),
        ])
        // The API wraps these lists in an object, never a bare array. Reading
        // data.data as an array is what threw".reduce is not a function".
        const earningsData = (earningsRes.data.data as any)?.earnings
        const payoutsData = (payoutsRes.data.data as any)?.payouts
        setEarnings(Array.isArray(earningsData) ? earningsData : [])
        setPayouts(Array.isArray(payoutsData) ? payoutsData : [])
        // Rate, minimum and lastComputedWeek come from the server's own ledger so
        // the page never quotes a made-up number or a fabricated zero.
        setSummary(dashboardRes.data.data as any)
      } catch (e) {
        console.error('Failed to load earnings:', e)
        setLoadError(true)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const money = (value: number) => `RWF ${Math.round(value || 0).toLocaleString()}`
  const totalEarnings = Number(summary?.totalEarnings || 0)
  const awaitingPayment = payouts
    .filter((p: any) => p.status === 'pending' || p.status === 'approved')
    .reduce((s: number, p: any) => s + Number(p.amount || 0), 0)
  const paidEarnings = payouts
    .filter((p: any) => p.status === 'paid')
    .reduce((s: number, p: any) => s + Number(p.amount || 0), 0)
  // The pay job has never run for this writer: say so instead of showing money.
  const ledgerNeverRan = !loading && !loadError && summary?.lastComputedWeek == null

  const statusIcon = (status: string) => {
    switch (status) {
      case 'paid': return <CheckCircle className="h-4 w-4 text-emerald-500" />
      case 'approved': return <CheckCircle className="h-4 w-4 text-blue-500" />
      case 'pending': return <Clock className="h-4 w-4 text-amber-500" />
      case 'rejected': return <XCircle className="h-4 w-4 text-red-500" />
      default: return <span className="inline-block h-2 w-2 rounded-full bg-slate-300" />
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="text-xl font-extrabold">{t('nav.writer.earnings')}</h1>
        <p className="text-sm text-slate-500">Your monetization status and history</p>
      </div>

      {!ledgerNeverRan && (
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-slate-600"><DollarSign className="h-4 w-4" />Total earned</div>
          <p className="mt-2 text-2xl font-bold">{money(totalEarnings)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-slate-600"><Clock className="h-4 w-4" />Awaiting payment</div>
          <p className="mt-2 text-2xl font-bold">{money(awaitingPayment)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-slate-600"><TrendingUp className="h-4 w-4" />Paid out</div>
          <p className="mt-2 text-2xl font-bold">{money(paidEarnings)}</p>
        </div>
      </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3 font-bold">Weekly Earnings History</div>
        {loadError ? (
          <div className="p-8 text-center">
            <p className="text-sm font-semibold text-red-600">We could not load your earnings.</p>
            <p className="mt-1 text-xs text-slate-500">Please reload the page to try again.</p>
          </div>
        ) : loading ? (
          <div className="p-8">
            <SkeletonBlock lines={4} />
          </div>
        ) : ledgerNeverRan ? (
          <div className="p-8 text-center">
            <DollarSign className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">
              Your weekly pay has not been calculated yet. It is worked out for the
              previous week, so keep publishing and this fills in.
            </p>
          </div>
        ) : earnings.length === 0 ? (
          <div className="p-8 text-center">
            <DollarSign className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">
              Nothing earned so far. Your weeks have been counted but none reached a payout.
            </p>
            {Number(summary?.rewardRate || 0) > 0 && (
              <p className="mt-1 text-xs text-slate-400">
                {money(summary.rewardRate)} per 1,000 valid views
                {Number(summary?.minimumPayout || 0) > 0
                  ? `, paid once a week reaches ${money(summary.minimumPayout)}`
                  : ''}.
              </p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {earnings.map((e: any) => (
              <div key={e._id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">
                    {new Date(e.weekStart).toLocaleDateString()} - {new Date(e.weekEnd).toLocaleDateString()}
                  </p>
                  <p className="text-xs text-slate-500">{e.validViews || 0} valid views</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold">RWF {Number(e.approvedAmount || e.calculatedAmount || 0).toLocaleString()}</span>
                  {statusIcon(e.status)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}