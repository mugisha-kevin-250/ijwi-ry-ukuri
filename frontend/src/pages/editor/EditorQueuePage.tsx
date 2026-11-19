import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Inbox, RefreshCw, Search } from 'lucide-react'
import { editorAPI, type StoryState } from '../../services/api'
import { useI18n } from '../../context/I18nContext'
import Avatar from '../../components/common/Avatar'

// The states an editor can be asked to look at. A reader never sees draft or
// approved copy, so the queue is the only place these exist on screen.
const STATES: StoryState[] = ['pending_review', 'approved', 'rejected', 'draft', 'published', 'archived']

const STATE_LABEL_KEY: Record<StoryState, string> = {
  pending_review: 'editor.states.pending',
  approved: 'editor.states.approved',
  rejected: 'editor.states.rejected',
  draft: 'editor.states.draft',
  published: 'editor.states.published',
  archived: 'editor.states.archived',
}

const STATE_STYLE: Record<StoryState, string> = {
  pending_review: 'bg-amber-50 text-amber-700 ring-amber-200',
  approved: 'bg-blue-50 text-blue-700 ring-blue-200',
  rejected: 'bg-red-50 text-red-700 ring-red-200',
  draft: 'bg-slate-100 text-slate-600 ring-slate-200',
  published: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  archived: 'bg-slate-100 text-slate-500 ring-slate-200',
}

function authorName(article: any): string {
  const author = article.author
  if (!author || typeof author === 'string') return 'Unknown writer'
  return author.fullName || author.username || 'Unknown writer'
}

export default function EditorQueuePage() {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()

  // The filter and page live in the URL, so"back" from a story returns the
  // editor to the slice of the queue they were working through.
  const requested = params.get('status') as StoryState | null
  const status: StoryState = requested && STATES.includes(requested) ? requested : 'pending_review'
  const page = Math.max(1, Number(params.get('page')) || 1)
  const search = params.get('search') || ''

  const [articles, setArticles] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await editorAPI.getQueue(status, page, search)
      setArticles(result.articles)
      setTotal(result.total)
      setTotalPages(result.totalPages)
      setPendingCount(result.pendingCount)
    } catch (err: any) {
      // A refused request is not an empty queue, and the page has to say so.
      setError(err?.response?.data?.message || 'We could not reach the review queue. Check your connection and try again.')
      setArticles([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [status, page, search])

  useEffect(() => {
    void load()
  }, [load])

  const setField = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    // Any filter change starts a new list, so the page never stays on page 7 of
    // a result that no longer has seven pages.
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{t('editor.queue.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('editor.queue.desc')}</p>
          {pendingCount > 0 && (
            <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
              <Inbox className="h-3.5 w-3.5" />
              {pendingCount} {t('editor.queue.waiting')}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" />
          {t('editor.queue.refresh')}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATES.map((state) => (
          <button
            key={state}
            type="button"
            onClick={() => setField('status', state)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition ${
              state === status ? STATE_STYLE[state] : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {t(STATE_LABEL_KEY[state])}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(event) => setField('search', event.target.value)}
          placeholder={t('editor.queue.search')}
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-semibold text-red-700">{error}</p>
        </div>
      ) : loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white" />
          ))}
        </div>
      ) : articles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <Inbox className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-700">
            {search ? t('editor.queue.noneSearch') : t('editor.queue.noneState')}
          </p>
          <p className="mt-1 text-xs text-slate-500">{t('editor.queue.noneHint')}</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {articles.map((article) => (
              <Link
                key={article._id}
                to={`/editor/articles/${article._id}`}
                className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-300 hover:shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-slate-900">{article.title}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">{article.summary}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className={`rounded-full px-2 py-0.5 font-bold ring-1 ${STATE_STYLE[article.status as StoryState] || STATE_STYLE.draft}`}>
                      {t(STATE_LABEL_KEY[article.status as StoryState] || 'editor.states.draft')}
                    </span>
                    <span>{authorName(article)}</span>
                    {article.aiGenerated && (
                      <span className="rounded-full bg-violet-50 px-2 py-0.5 font-bold text-violet-700 ring-1 ring-violet-200">
                        {t('editor.queue.aiWritten')}
                      </span>
                    )}
                    <span>{new Date(article.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <Avatar
                  name={authorName(article)}
                  src={typeof article.author === 'object' ? article.author?.profileImage || article.author?.avatar : undefined}
                  className="h-9 w-9 shrink-0 bg-slate-100 text-sm font-bold text-slate-600"
                />
              </Link>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>
                {t('editor.queue.showing')} · {total} · {page} / {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setField('page', String(page - 1))}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold disabled:opacity-40"
                >
                  {t('editor.queue.previous')}
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setField('page', String(page + 1))}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold disabled:opacity-40"
                >
                  {t('editor.queue.next')}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
