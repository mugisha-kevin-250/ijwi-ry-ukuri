import { useEffect, useState } from 'react'
import { writerAPI } from '../../services/api'
import { useI18n } from '../../context/I18nContext'
import { DollarSign, TrendingUp, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react'

export default function WriterEarningsPage() {
  const { t } = useI18n()
  const [earnings, setEarnings] = useState<any[]>([])
  const [payouts, setPayouts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [earningsRes, payoutsRes] = await Promise.all([
          writerAPI.getEarnings(),
          writerAPI.getPayouts(),
        ])
        setEarnings((earningsRes.data.data as any[]) || [])
        setPayouts((payoutsRes.data.data as any[]) || [])
      } catch (e) {
        console.error('Failed to load earnings:', e)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const totalEarnings = earnings.reduce((s: number, e: any) => s + Number(e.approvedAmount || e.calculatedAmount || 0), 0)
  const pendingEarnings = earnings.filter((e: any) => e.status === 'pending').reduce((s: number, e: any) => s + Number(e.calculatedAmount || 0), 0)
  const paidEarnings = payouts.filter((p: any) => p.status === 'paid').reduce((s: number, p: any) => s + Number(p.amount || 0), 0)

  const statusIcon = (status: string) => {
    switch (status) {
      case 'paid': return <CheckCircle className="h-4 w-4 text-emerald-500" />
      case 'approved': return <CheckCircle className="h-4 w-4 text-blue-500" />
      case 'pending': return <Clock className="h-4 w-4 text-amber-500" />
      case 'rejected': return <XCircle className="h-4 w-4 text-red-500" />
      default: return <Loader2 className="h-4 w-4 text-slate-400" />
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="text-xl font-extrabold">{t('nav.writer.earnings')}</h1>
        <p className="text-sm text-slate-500">Your monetization status and history</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-slate-600"><DollarSign className="h-4 w-4" />Total Approved Earnings</div>
          <p className="mt-2 text-2xl font-bold">RWF {totalEarnings.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-slate-600"><Clock className="h-4 w-4" />Pending Review</div>
          <p className="mt-2 text-2xl font-bold">RWF {pendingEarnings.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-slate-600"><TrendingUp className="h-4 w-4" />Total Paid Out</div>
          <p className="mt-2 text-2xl font-bold">RWF {paidEarnings.toLocaleString()}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3 font-bold">Weekly Earnings History</div>
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading...</div>
        ) : earnings.length === 0 ? (
          <div className="p-8 text-center">
            <DollarSign className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">No earnings yet. Publish articles to start earning.</p>
            <p className="mt-1 text-xs text-slate-400">Earnings are calculated based on valid views (RWF 5,000 per 1,000 valid views).</p>
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