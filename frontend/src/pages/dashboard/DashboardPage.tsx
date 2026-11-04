import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Activity,
  BarChart3,
  BookOpen,
  Eye,
  FileClock,
  FileText,
  RefreshCw,
  Users,
  Wallet,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { adminAPI, writerAPI } from '../../services/api'
import type { AdminDashboardStats, Article, DashboardStats } from '../../types'
import { useAuth } from '../../context/AuthContext'

type DashboardKind = 'writer' | 'admin'
type Metric = { title: string; value: string; note: string; icon: typeof Eye; tone: string; id?: string }

function getArticleList(payload: Article[] | { articles: Article[] } | undefined) {
  if (Array.isArray(payload)) return payload
  return payload?.articles || []
}

function formatNumber(value: number | undefined) {
  return (value || 0).toLocaleString()
}

function makeChartData(articles: Article[]) {
  const days = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date()
    date.setDate(date.getDate() - (6 - offset))
    date.setHours(0, 0, 0, 0)
    return { date, name: date.toLocaleDateString(undefined, { weekday: 'short' }), views: 0, stories: 0 }
  })

  articles.forEach((article) => {
    const published = new Date(article.publishedAt || article.createdAt)
    published.setHours(0, 0, 0, 0)
    const day = days.find((item) => item.date.getTime() === published.getTime())
    if (day) {
      day.views += article.views || 0
      day.stories += 1
    }
  })

  return days
}

function MetricCard({ metric }: { metric: Metric }) {
  const Icon = metric.icon
  return (
    <article id={metric.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{metric.title}</p>
          <p className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">{metric.value}</p>
          <p className="mt-2 flex items-center gap-1 text-xs font-medium text-emerald-700"><ArrowUpRight className="h-3.5 w-3.5" />{metric.note}</p>
        </div>
        <span className={`rounded-lg p-2.5 ${metric.tone}`}><Icon className="h-5 w-5" /></span>
      </div>
    </article>
  )
}

export default function DashboardPage({ kind }: { kind: DashboardKind }) {
  const { user } = useAuth()
  const [writerStats, setWriterStats] = useState<DashboardStats | null>(null)
  const [adminStats, setAdminStats] = useState<AdminDashboardStats | null>(null)
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      if (kind === 'writer') {
        const [statsResponse, articlesResponse] = await Promise.all([
          writerAPI.getDashboard(),
          writerAPI.getMyArticles(),
        ])
        setWriterStats(statsResponse.data.data)
        setArticles(getArticleList(articlesResponse.data.data))
      } else {
        const statsResponse = await adminAPI.getDashboard()
        setAdminStats(statsResponse.data.data)
        setArticles(statsResponse.data.data?.topArticles || [])
      }
    } catch (loadError) {
      console.error(`Failed to load ${kind} dashboard:`, loadError)
      setError('We could not load your dashboard data. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [kind])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  const chartData = useMemo(() => makeChartData(articles), [articles])
  const metrics: Metric[] = kind === 'writer'
    ? [
        { title: 'Published stories', value: formatNumber(writerStats?.publishedArticles), note: `${formatNumber(writerStats?.totalArticles)} total submissions`, icon: BookOpen, tone: 'bg-blue-50 text-blue-700' },
        { title: 'Article views', value: formatNumber(writerStats?.totalValidViews), note: `${formatNumber(writerStats?.viewsThisWeek)} this week`, icon: Eye, tone: 'bg-emerald-50 text-emerald-700' },
        { title: 'In review', value: formatNumber(writerStats?.pendingArticles), note: 'Stories awaiting review', icon: FileClock, tone: 'bg-amber-50 text-amber-700' },
        { title: 'Current earnings', value: `RWF ${formatNumber(writerStats?.currentEarnings)}`, note: `Previous week RWF ${formatNumber(writerStats?.previousWeeklyEarnings)}`, icon: Wallet, tone: 'bg-violet-50 text-violet-700', id: 'earnings' },
      ]
    : [
        { title: 'Total users', value: formatNumber(adminStats?.totalUsers), note: `${formatNumber(adminStats?.totalReaders)} readers`, icon: Users, tone: 'bg-blue-50 text-blue-700', id: 'users' },
        { title: 'Published stories', value: formatNumber(adminStats?.publishedArticles), note: `${formatNumber(adminStats?.pendingArticles)} awaiting review`, icon: BookOpen, tone: 'bg-emerald-50 text-emerald-700' },
        { title: 'Valid views', value: formatNumber(adminStats?.validViews), note: `${formatNumber(adminStats?.viewsThisWeek)} this week`, icon: Eye, tone: 'bg-violet-50 text-violet-700' },
        { title: 'Pending payouts', value: `RWF ${formatNumber(adminStats?.pendingPayouts)}`, note: `RWF ${formatNumber(adminStats?.pendingEarnings)} pending earnings`, icon: Wallet, tone: 'bg-amber-50 text-amber-700', id: 'payouts' },
      ]
  const isAdmin = kind === 'admin'

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-blue-700">{isAdmin ? 'Platform overview' : 'Creator studio'}</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">{isAdmin ? 'Admin dashboard' : `Welcome back, ${user?.fullName?.split(' ')[0] || 'Writer'}`}</h1>
          <p className="mt-1 text-sm text-slate-500">{isAdmin ? 'Monitor newsroom activity and platform performance.' : 'Your stories, audience and earnings at a glance.'}</p>
        </div>
        <button type="button" onClick={() => void loadDashboard()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh
        </button>
      </div>

      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><span>{error}</span><button type="button" onClick={() => void loadDashboard()} className="font-bold underline">Try again</button></div>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Key metrics">
        {metrics.map((metric) => loading
          ? <div key={metric.title} className="h-[132px] animate-pulse rounded-xl bg-slate-200" />
          : <MetricCard key={metric.title} metric={metric} />)}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)]">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="font-bold text-slate-900">{isAdmin ? 'Newsroom activity' : 'Your audience'}</h2><p className="mt-1 text-xs text-slate-500">Published story views from the last 7 days</p></div>
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700"><Activity className="h-3.5 w-3.5" />Last 7 days</span>
          </div>
          <div className="h-[260px]" role="img" aria-label="Chart of views for the past seven days">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}>
                <defs><linearGradient id="dashboardViews" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity={0.25} /><stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} /></linearGradient></defs>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 12 }} />
                <Area type="monotone" dataKey="views" name="Views" stroke="#2563eb" strokeWidth={2.5} fill="url(#dashboardViews)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-bold text-slate-900">{isAdmin ? 'Platform summary' : 'Story performance'}</h2><BarChart3 className="h-4 w-4 text-blue-700" /></div>
          <div className="space-y-4">
            {(isAdmin
              ? [
                  ['Writers', formatNumber(adminStats?.totalWriters), 'text-blue-700'],
                  ['Editors', formatNumber(adminStats?.totalEditors), 'text-violet-700'],
                  ['Pending review', formatNumber(adminStats?.pendingArticles), 'text-amber-700'],
                  ['Paid to creators', `RWF ${formatNumber(adminStats?.totalPaidAmount)}`, 'text-emerald-700'],
                ]
              : [
                  ['Total submissions', formatNumber(writerStats?.totalArticles), 'text-blue-700'],
                  ['Published stories', formatNumber(writerStats?.publishedArticles), 'text-emerald-700'],
                  ['Views this week', formatNumber(writerStats?.viewsThisWeek), 'text-violet-700'],
                  ['Awaiting review', formatNumber(writerStats?.pendingArticles), 'text-amber-700'],
                ]).map(([label, value, color]) => (
                  <div key={label} id={isAdmin && label === 'Paid to creators' ? 'earnings' : undefined} className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                    <span className="text-sm text-slate-500">{label}</span><span className={`text-sm font-bold ${color}`}>{loading ? '—' : value}</span>
                  </div>
                ))}
          </div>
          <Link to={isAdmin ? '/articles' : '#my-articles'} className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-blue-700 hover:text-blue-900">
            {isAdmin ? 'Review newsroom' : 'View your stories'}<ArrowRight className="h-4 w-4" />
          </Link>
        </article>
      </section>

      <section id="my-articles" className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div><h2 className="font-bold text-slate-900">{isAdmin ? 'Top stories' : 'Your recent stories'}</h2><p className="mt-1 text-xs text-slate-500">{isAdmin ? 'Stories with the highest current reach' : 'Your latest submissions and their review status'}</p></div>
          <Link to="/articles" className="text-sm font-bold text-blue-700 hover:text-blue-900">Browse articles</Link>
        </div>
        {loading ? <div className="space-y-3 p-5">{[1, 2, 3].map((item) => <div key={item} className="h-12 animate-pulse rounded bg-slate-100" />)}</div> : articles.length ? (
          <div className="divide-y divide-slate-100">
            {articles.slice(0, 5).map((article) => (
              <div key={article._id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1"><Link to={`/article/${article.slug}`} className="line-clamp-1 text-sm font-semibold text-slate-800 hover:text-blue-800">{article.title}</Link><p className="mt-1 text-xs text-slate-400">{new Date(article.publishedAt || article.createdAt).toLocaleDateString()}</p></div>
                <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Eye className="h-3.5 w-3.5" />{formatNumber(article.views)}</span>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${article.status === 'published' ? 'bg-emerald-50 text-emerald-700' : article.status === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{article.status.replace('_', ' ')}</span>
              </div>
            ))}
          </div>
        ) : <div className="px-5 py-10 text-center"><FileText className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2 text-sm text-slate-500">{isAdmin ? 'No published articles to highlight yet.' : 'Your stories will appear here when you submit them.'}</p>{!isAdmin && <Link to="/articles" className="mt-3 inline-block text-sm font-bold text-blue-700">Explore published stories</Link>}</div>}
      </section>
      {!isAdmin && (
        <section id="profile" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-bold text-slate-900">Creator profile</h2>
          <div className="mt-3 flex flex-wrap items-center gap-x-8 gap-y-2 text-sm text-slate-600">
            <span className="font-semibold text-slate-800">{user?.fullName}</span>
            <span>{user?.email}</span>
            {user?.country && <span>{user.country}</span>}
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{user?.writerStatus || 'Writer'}</span>
          </div>
        </section>
      )}
      {isAdmin && <div id="settings" className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800"><ArrowDownRight className="mr-1 inline h-3.5 w-3.5" />Summary metrics update whenever the dashboard is refreshed.</div>}
    </div>
  )
}
