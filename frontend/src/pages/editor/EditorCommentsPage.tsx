import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Flag, Inbox, Loader2, MessageSquareOff, RefreshCw, Search } from 'lucide-react'
import { editorAPI, type CommentState, type ModeratedComment } from '../../services/api'
import { useI18n } from '../../context/I18nContext'
import Avatar from '../../components/common/Avatar'

// Only a person takes a comment away from readers, and this is the single place
// that decision is made, so the queue has to show what the reader still sees.
const STATES: CommentState[] = ['reported', 'active', 'hidden', 'deleted']

const STATE_LABEL_KEY: Record<CommentState, string> = {
  reported: 'moderation.states.reported',
  active: 'moderation.states.active',
  hidden: 'moderation.states.hidden',
  deleted: 'moderation.states.deleted',
}

const STATE_STYLE: Record<CommentState, string> = {
  reported: 'bg-amber-50 text-amber-700 ring-amber-200',
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  hidden: 'bg-slate-100 text-slate-600 ring-slate-200',
  deleted: 'bg-red-50 text-red-700 ring-red-200',
}

export default function EditorCommentsPage() {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()

  const requested = params.get('status') as CommentState | null
  const status: CommentState = requested && STATES.includes(requested) ? requested : 'reported'
  const page = Math.max(1, Number(params.get('page')) || 1)
  const search = params.get('search') || ''

  const [comments, setComments] = useState<ModeratedComment[]>([])
  const [counts, setCounts] = useState<Record<CommentState, number>>({ active: 0, reported: 0, hidden: 0, deleted: 0 })
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [notes, setNotes] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await editorAPI.getComments(status, page, search)
      setComments(result.comments)
      setCounts(result.counts)
      setTotal(result.total)
      setTotalPages(result.totalPages)
    } catch (err: any) {
      // An empty list and a refused list are different answers.
      setError(err?.response?.data?.message || t('moderation.loadFailed'))
      setComments([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [status, page, search, t])

  useEffect(() => {
    void load()
  }, [load])

  const setField = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }

  const decide = async (comment: ModeratedComment, action: 'hide' | 'restore' | 'delete') => {
    setBusyId(comment._id)
    setError('')
    try {
      await editorAPI.moderateComment(comment._id, action, notes[comment._id] || undefined)
      setNotes((prev) => ({ ...prev, [comment._id]: '' }))
      await load()
    } catch (err: any) {
      setError(err?.response?.data?.message || t('moderation.actionFailed'))
    } finally {
      setBusyId('')
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{t('moderation.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('moderation.desc')}</p>
          {counts.reported > 0 && (
            <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
              <Flag className="h-3.5 w-3.5" />
              {counts.reported} {t(counts.reported === 1 ? 'moderation.waitingOne' : 'moderation.waitingMany')}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {t('moderation.refresh')}
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
            {t(STATE_LABEL_KEY[state])} · {counts[state]}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(event) => setField('search', event.target.value)}
          placeholder={t('moderation.search')}
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
            <div key={i} className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white" />
          ))}
        </div>
      ) : comments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <MessageSquareOff className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-700">
            {search ? t('moderation.noneSearch') : t('moderation.noneState')}
          </p>
          <p className="mt-1 text-xs text-slate-500">{t('moderation.noneHint')}</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {comments.map((comment) => (
              <div key={comment._id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{comment.content}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className={`rounded-full px-2 py-0.5 font-bold ring-1 ${STATE_STYLE[comment.status] || STATE_STYLE.active}`}>
                        {t(STATE_LABEL_KEY[comment.status] || 'moderation.states.active')}
                      </span>
                      <span>{comment.user?.fullName || comment.user?.username || t('moderation.deletedAuthor')}</span>
                      {comment.article && (
                        <Link to={`/editor/articles/${comment.article._id}`} className="font-semibold text-blue-700 hover:underline">
                          {comment.article.title}
                        </Link>
                      )}
                      {comment.createdAt && <span>{new Date(comment.createdAt).toLocaleString()}</span>}
                    </div>
                    {comment.status === 'reported' && (
                      <p className="mt-2 inline-flex items-center gap-2 rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                        <Inbox className="h-3.5 w-3.5" />
                        {comment.reports} {t(comment.reports === 1 ? 'moderation.reportOne' : 'moderation.reportMany')}
                        {comment.reportReason ? ` · ${comment.reportReason}` : ''}
                      </p>
                    )}
                    {comment.moderatedBy && (
                      <p className="mt-2 text-xs text-slate-500">
                        {t('moderation.decidedBy')} {comment.moderatedBy.fullName || comment.moderatedBy.username}
                        {comment.moderationNote ? ` · ${comment.moderationNote}` : ''}
                      </p>
                    )}
                  </div>
                  <Avatar
                    name={comment.user?.fullName || comment.user?.username || ''}
                    src={undefined}
                    className="h-9 w-9 shrink-0 bg-slate-100 text-sm font-bold text-slate-600"
                  />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    value={notes[comment._id] || ''}
                    onChange={(event) => setNotes((prev) => ({ ...prev, [comment._id]: event.target.value }))}
                    placeholder={t('moderation.notePlaceholder')}
                    className="min-w-[12rem] flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {comment.status !== 'hidden' && (
                    <button
                      type="button"
                      disabled={busyId === comment._id}
                      onClick={() => void decide(comment, 'hide')}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {t('moderation.hide')}
                    </button>
                  )}
                  {(comment.status === 'hidden' || comment.status === 'deleted') && (
                    <button
                      type="button"
                      disabled={busyId === comment._id}
                      onClick={() => void decide(comment, 'restore')}
                      className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      {t('moderation.restore')}
                    </button>
                  )}
                  {comment.status !== 'deleted' && (
                    <button
                      type="button"
                      disabled={busyId === comment._id}
                      onClick={() => void decide(comment, 'delete')}
                      className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      {t('moderation.delete')}
                    </button>
                  )}
                  {busyId === comment._id && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>
                {t('moderation.showing')} · {total} · {page} / {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setField('page', String(page - 1))}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold disabled:opacity-40"
                >
                  {t('moderation.previous')}
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setField('page', String(page + 1))}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold disabled:opacity-40"
                >
                  {t('moderation.next')}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
