import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Inbox, Loader2, PenTool, RefreshCw, Settings2 } from 'lucide-react'
import { editorAPI } from '../../services/api'
import { useI18n } from '../../context/I18nContext'

export default function EditorDashboardPage() {
  const { t } = useI18n()
  const [stats, setStats] = useState<Record<string, number> | null>(null)
  const [waiting, setWaiting] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [statsRes, queueRes] = await Promise.all([
        editorAPI.getStats(),
        editorAPI.getQueue('pending_review', 1),
      ])
      setStats((statsRes.data.data as any)?.stats || null)
      setWaiting(queueRes.articles.slice(0, 5))
    } catch (err: any) {
      setError(err?.response?.data?.message || 'We could not reach the newsroom numbers.')
      setStats(null)
      setWaiting([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{t('editor.dashboard.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('editor.dashboard.desc')}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {t('editor.queue.refresh')}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { key: 'pending', label: t('editor.states.pending'), to: '/editor/pending?status=pending_review' },
          { key: 'approved', label: t('editor.states.approved'), to: '/editor/pending?status=approved' },
          { key: 'rejected', label: t('editor.states.rejected'), to: '/editor/pending?status=rejected' },
          { key: 'published', label: t('editor.states.published'), to: '/editor/pending?status=published' },
        ].map((card) => (
          <Link
            key={card.key}
            to={card.to}
            className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-300 hover:shadow-sm"
          >
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{card.label}</p>
            <p className="mt-2 text-3xl font-extrabold text-slate-900">
              {/* A number we could not read is not a zero, and on this desk the
                  difference is a story nobody looks at. */}
              {loading || error || !stats ? '—' : Number(stats[card.key] ?? 0).toLocaleString()}
            </p>
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <p className="text-sm font-bold text-slate-900">{t('editor.dashboard.waiting')}</p>
          <Link to="/editor/pending" className="text-sm font-bold text-blue-700 hover:underline">
            {t('editor.dashboard.openQueue')}
          </Link>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">{t('common.loading')}</div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-slate-500">{t('editor.dashboard.numbersFailedHint')}</div>
        ) : waiting.length === 0 ? (
          <div className="p-8 text-center">
            <Inbox className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-2 text-sm text-slate-600">{t('editor.dashboard.queueEmpty')}</p>
            <p className="mt-1 text-xs text-slate-400">{t('editor.dashboard.queueEmptyHint')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {waiting.map((article) => (
              <li key={article._id}>
                <Link to={`/editor/articles/${article._id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{article.title}</p>
                    <p className="text-xs text-slate-500">
                      {typeof article.author === 'object' ? article.author?.fullName || 'Unknown writer' : 'Unknown writer'}
                      {' · '}
                      {new Date(article.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {article.aiGenerated && (
                    <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                      {t('editor.queue.aiWritten')}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link to="/editor/pending" className="rounded-xl border border-slate-200 bg-white p-4 hover:border-blue-300">
          <Inbox className="h-5 w-5 text-blue-600" />
          <p className="mt-2 text-sm font-bold text-slate-900">{t('editor.dashboard.reviewQueue')}</p>
          <p className="text-xs text-slate-500">{t('editor.dashboard.reviewQueueHint')}</p>
        </Link>
        <Link to="/editor/articles" className="rounded-xl border border-slate-200 bg-white p-4 hover:border-blue-300">
          <PenTool className="h-5 w-5 text-blue-600" />
          <p className="mt-2 text-sm font-bold text-slate-900">{t('nav.writer.myArticles')}</p>
          <p className="text-xs text-slate-500">{t('editor.dashboard.myStoriesHint')}</p>
        </Link>
      </div>

      <p className="flex items-center gap-2 text-xs text-slate-500">
        <Settings2 className="h-4 w-4" />
        {t('editor.dashboard.sectionNote')}
      </p>
    </div>
  )
}
