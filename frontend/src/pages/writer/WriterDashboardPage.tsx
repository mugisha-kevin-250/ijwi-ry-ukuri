import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, Check, Eye, FileText, Heart, Plus, RefreshCw, Users } from 'lucide-react'
import { writerAPI, type WriterStoryMetric } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../context/I18nContext'
import AiWriterPanel from '../../components/writers/AiWriterPanel'

interface WriterSummary {
  totalArticles?: number
  publishedArticles?: number
  pendingArticles?: number
  totalValidViews?: number
  viewsThisWeek?: number
  currentEarnings?: number
  previousWeeklyEarnings?: number
  totalEarnings?: number
  lastComputedWeek?: string | null
  rewardRate?: number
  minimumPayout?: number
  followersCount?: number
  topPerformingArticle?: { _id: string; title: string; slug: string; validViews: number } | null
}

const money = (value: number | undefined) => `RWF ${Math.round(value || 0).toLocaleString()}`

export default function WriterDashboardPage() {
  const { user } = useAuth()
  const { t } = useI18n()
  const [summary, setSummary] = useState<WriterSummary | null>(null)
  const [recent, setRecent] = useState<WriterStoryMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [dashboardRes, metricsRes] = await Promise.all([
        writerAPI.getDashboard(),
        writerAPI.getStoryMetrics({ limit: 5, sort: 'newest' }),
      ])
      setSummary(dashboardRes.data.data as WriterSummary)
      setRecent(metricsRes.stories)
    } catch (err: any) {
      // The old page swallowed this and printed a board full of zeroes, which
      // read as"nobody has looked at your work" when it meant"we lost the
      // connection". Say which one happened.
      setError(err?.response?.data?.message || 'We could not reach your numbers. Check your connection and try again.')
      setSummary(null)
      setRecent([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // A pay figure only exists once the weekly job has actually run, and a null
  // from the server is not the same thing as earning nothing.
  const payComputed = Boolean(summary?.lastComputedWeek)

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-[var(--color-text)]">{t('nav.writer.dashboard')}</h1>
          <p className="text-sm text-[var(--color-text-muted)]">{user?.fullName}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            {t('editor.queue.refresh')}
          </button>
          <Link to="/writer/articles/new" className="btn-primary inline-flex items-center gap-2">
            <Plus className="h-4 w-4" /> {t('writer.newArticle')}
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          icon={FileText}
          label={t('writer.totalArticles')}
          value={reading(summary, loading, (row) => (row.totalArticles || 0).toLocaleString())}
          note={reading(summary, loading, (row) => `${(row.publishedArticles || 0).toLocaleString()} ${t('writer.dash.publishedOf')}`)}
        />
        <Card
          icon={Eye}
          label={t('writer.dash.validViews')}
          value={reading(summary, loading, (row) => (row.totalValidViews || 0).toLocaleString())}
          note={reading(summary, loading, (row) => `${(row.viewsThisWeek || 0).toLocaleString()} ${t('writer.dash.thisWeek')}`)}
        />
        <Card
          icon={BarChart3}
          label={t('writer.dash.inReview')}
          value={reading(summary, loading, (row) => (row.pendingArticles || 0).toLocaleString())}
          note={t('writer.dash.inReviewHint')}
        />
        <Card
          icon={Users}
          label={t('writer.dash.followers')}
          value={reading(summary, loading, (row) => (row.followersCount || 0).toLocaleString())}
          note={t('writer.dash.followersHint')}
        />
      </div>

      {/* The AI writer is on the author's own board, not behind the admin door.
          It drafts; the author's shelf and the editor's queue decide what goes
          out, exactly as with anything they typed themselves. */}
      <div className="mt-6">
        <AiWriterPanel />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-[var(--color-border)] bg-white p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-[var(--color-text)]">{t('writer.dash.recent')}</p>
            <Link to="/writer/articles" className="text-sm font-bold text-[var(--color-brand-text)] hover:underline">
              {t('writer.dash.allStories')}
            </Link>
          </div>
          {loading ? (
            <p className="mt-6 text-sm text-[var(--color-text-muted)]">{t('common.loading')}</p>
          ) : error ? (
            <p className="mt-6 text-sm text-[var(--color-text-muted)]">{t('writer.dash.recentFailed')}</p>
          ) : recent.length === 0 ? (
            <div className="mt-6 text-center">
              <p className="text-sm text-[var(--color-text-muted)]">{t('writer.noArticles')}</p>
              <Link to="/writer/articles/new" className="mt-2 inline-block text-sm font-bold text-[var(--color-brand-text)] hover:underline">
                {t('writer.newArticle')}
              </Link>
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--color-border)]">
              {recent.map((story) => (
                <li key={story._id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <Link to={`/writer/articles/${story._id}/edit`} className="block truncate text-sm font-semibold text-[var(--color-text)] hover:underline">
                      {story.title}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-muted)]">
                      <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{story.views.toLocaleString()}</span>
                      <span className="flex items-center gap-1"><Check className="h-3 w-3" />{story.validViews.toLocaleString()}</span>
                      <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{story.likes.toLocaleString()}</span>
                      {!story.hasViewData && <span className="italic">{t('writer.list.notReadYet')}</span>}
                    </div>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold capitalize text-slate-600">
                    {t(`editor.states.${STATE_KEY[story.status] || 'draft'}`)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-4">
          <section className="rounded-xl border border-[var(--color-border)] bg-white p-5">
            <p className="text-sm font-bold text-[var(--color-text)]">{t('writer.dash.payTitle')}</p>
            {!payComputed ? (
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">{t('writer.dash.payNotStarted')}</p>
            ) : (
              <>
                <p className="mt-2 text-3xl font-extrabold text-[var(--color-text)]">{money(summary?.currentEarnings)}</p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  {money(summary?.previousWeeklyEarnings)} · {t('writer.dash.previousWeek')}
                </p>
                <p className="mt-3 text-xs text-[var(--color-text-muted)]">
                  {money(summary?.rewardRate)} {t('writer.dash.perThousand')} · {t('writer.dash.minPayout')} {money(summary?.minimumPayout)}
                </p>
              </>
            )}
            <Link to="/writer/earnings" className="mt-3 inline-block text-sm font-bold text-[var(--color-brand-text)] hover:underline">
              {t('writer.dash.openEarnings')}
            </Link>
          </section>

          <section className="rounded-xl border border-[var(--color-border)] bg-white p-5">
            <p className="text-sm font-bold text-[var(--color-text)]">{t('writer.dash.bestTitle')}</p>
            {loading ? (
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">{t('common.loading')}</p>
            ) : summary?.topPerformingArticle ? (
              <>
                <p className="mt-2 text-sm font-semibold text-[var(--color-text)]">{summary.topPerformingArticle.title}</p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  {(summary.topPerformingArticle.validViews || 0).toLocaleString()} {t('writer.dash.validReads')}
                </p>
                <Link to={`/article/${summary.topPerformingArticle.slug}`} className="mt-3 inline-block text-sm font-bold text-[var(--color-brand-text)] hover:underline">
                  {t('writer.dash.openStory')}
                </Link>
              </>
            ) : (
              //"Best" only means something once a story has been read, so an
              // unread shelf is reported as such instead of crowning a story.
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">{t('writer.dash.bestNone')}</p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

const STATE_KEY: Record<string, string> = {
  pending_review: 'pending',
  approved: 'approved',
  rejected: 'rejected',
  draft: 'draft',
  published: 'published',
  archived: 'archived',
}

// Until the request lands there is no number to show, and a dash reads as
//"unknown" where a zero reads as"measured and empty".
function reading(summary: WriterSummary | null, loading: boolean, pick: (row: WriterSummary) => string): string {
  if (loading) return '…'
  if (!summary) return '—'
  return pick(summary)
}

function Card({ icon: Icon, label, value, note }: { icon: typeof Eye; label: string; value: string; note: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
        <Icon className="h-5 w-5" />
        {label}
      </div>
      <p className="mt-2 text-3xl font-bold text-[var(--color-text)]">{value}</p>
      <p className="mt-1 text-xs text-[var(--color-text-muted)]">{note}</p>
    </div>
  )
}
