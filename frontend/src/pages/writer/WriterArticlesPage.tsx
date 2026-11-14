import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, ChevronLeft, ChevronRight, Clock, Eye, Heart, Loader2, MessageSquare, Pencil, Plus, RefreshCw, Search, Send, Timer, Trash2, Undo2 } from 'lucide-react'
import { writerAPI, type StoryState, type WriterStoryMetric } from '../../services/api'
import { useI18n } from '../../context/I18nContext'
import { ConfirmDialog } from '../../components/common/Modal'

// Only the states a story can actually hold, and the sort names the backend
// recognises - anything else would silently widen or reshape the list.
const STATES: StoryState[] = ['draft', 'pending_review', 'approved', 'published', 'rejected', 'archived']

const SORT_OPTIONS = ['newest', 'oldest', 'views', 'likes'] as const
type SortOption = (typeof SORT_OPTIONS)[number]

const STATE_STYLE: Record<StoryState, string> = {
  draft: 'bg-slate-100 text-slate-600',
  pending_review: 'bg-amber-50 text-amber-700',
  approved: 'bg-blue-50 text-blue-700',
  published: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-700',
  archived: 'bg-slate-100 text-slate-500',
}

const STATE_LABEL_KEY: Record<StoryState, string> = {
  draft: 'editor.states.draft',
  pending_review: 'editor.states.pending',
  approved: 'editor.states.approved',
  published: 'editor.states.published',
  rejected: 'editor.states.rejected',
  archived: 'editor.states.archived',
}

function averageRead(seconds: number | null): string {
  if (seconds == null) return ''
  if (seconds < 60) return `${Math.round(seconds)}s`
  return `${Math.round(seconds / 6) / 10} min`
}

export default function WriterArticlesPage() {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()

  // The filters live in the URL, so coming back from an edit returns the writer
  // to the slice of the shelf they were working through.
  const requested = params.get('status') as StoryState | null
  const status: StoryState | '' = requested && STATES.includes(requested) ? requested : ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const search = params.get('search') || ''
  const requestedSort = params.get('sort') as SortOption | null
  const sort: SortOption = requestedSort && SORT_OPTIONS.includes(requestedSort) ? requestedSort : 'newest'

  const [stories, setStories] = useState<WriterStoryMetric[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<WriterStoryMetric | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await writerAPI.getStoryMetrics({ status: status || undefined, page, limit: 10, sort, search: search || undefined })
      setStories(result.stories)
      setTotal(result.total)
      setTotalPages(result.totalPages)
    } catch (err: any) {
      // A refused request is not an empty shelf, and the two read very
      // differently to someone who knows they wrote five stories last week.
      setError(err?.response?.data?.message || 'We could not load your stories. Check your connection and try again.')
      setStories([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [status, page, sort, search])

  useEffect(() => {
    void load()
  }, [load])

  const setField = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    // Any filter change starts a new list, so page 7 of a result that no longer
    // has seven pages never gets requested.
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }

  const run = async (story: WriterStoryMetric, action: 'submit' | 'withdraw' | 'delete') => {
    setBusy(`${action}:${story._id}`)
    setActionError('')
    try {
      if (action === 'submit') await writerAPI.submitArticle(story._id)
      else if (action === 'withdraw') await writerAPI.withdrawArticle(story._id)
      else await writerAPI.deleteArticle(story._id)
      setConfirmDelete(null)
    } catch (err: any) {
      // The lifecycle refuses with a sentence that says what to do next.
      setActionError(err?.response?.data?.message || 'That did not go through.')
      setConfirmDelete(null)
    } finally {
      setBusy('')
      // Always re-read: the row may have moved even when the call was refused.
      await load()
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-[var(--color-text)]">{t('nav.writer.myArticles')}</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            {loading || error
              ? t('writer.list.counting')
              : `${total.toLocaleString()} ${total === 1 ? t('writer.list.storyOne') : t('writer.list.stories')}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t('editor.queue.refresh')}
          </button>
          <Link to="/writer/articles/new" className="btn-primary inline-flex items-center gap-2">
            <Plus className="h-4 w-4" /> {t('writer.newArticle')}
          </Link>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[
          { value: '' as StoryState | '', label: t('writer.list.all') },
          ...STATES.map((state) => ({ value: state as StoryState | '', label: t(STATE_LABEL_KEY[state]) })),
        ].map((chip) => (
          <button
            key={chip.value || 'all'}
            type="button"
            onClick={() => setField('status', chip.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition ${
              chip.value === status
                ? chip.value === ''
                  ? 'bg-slate-900 text-white ring-slate-900'
                  : `${STATE_STYLE[chip.value]} ring-current`
                : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setField('search', event.target.value)}
            placeholder={t('writer.list.search')}
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <select
          value={sort}
          onChange={(event) => setField('sort', event.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          aria-label={t('writer.list.sortLabel')}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option} value={option}>{t(`writer.list.sort.${option}`)}</option>
          ))}
        </select>
      </div>

      {actionError && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{actionError}</p>
      )}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm font-semibold text-red-700">{error}</div>
      ) : loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl border border-[var(--color-border)]" />)}
        </div>
      ) : stories.length === 0 ? (
        <div className="card border-dashed p-12 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">
            {search || status ? t('writer.list.noneMatching') : t('writer.noArticles')}
          </p>
          {!search && !status && (
            <Link to="/writer/articles/new" className="mt-3 inline-block text-sm font-bold text-[var(--color-brand-text)] hover:text-[var(--color-brand-hover)]">
              {t('writer.newArticle')}
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {stories.map((story) => (
              <article key={story._id} className="rounded-xl border border-[var(--color-border)] bg-white p-4">
                <div className="flex flex-wrap items-start gap-4">
                  {story.featuredImage && (
                    <img src={story.featuredImage} alt="" loading="lazy" className="h-16 w-24 shrink-0 rounded-lg object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <Link to={`/writer/articles/${story._id}/edit`} className="block truncate font-semibold text-[var(--color-text)] hover:underline">
                      {story.title}
                    </Link>
                    <p className="mt-1 line-clamp-2 text-sm text-[var(--color-text-muted)]">{story.summary}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-muted)]">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATE_STYLE[story.status]}`}>
                        {t(STATE_LABEL_KEY[story.status])}
                      </span>
                      {story.publishedAt && <span>{new Date(story.publishedAt).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {story.actions.includes('submit') && (
                      <button
                        type="button"
                        onClick={() => void run(story, 'submit')}
                        disabled={busy !== ''}
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {busy === `submit:${story._id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        {t('writer.list.sendReview')}
                      </button>
                    )}
                    {story.actions.includes('withdraw') && (
                      <button
                        type="button"
                        onClick={() => void run(story, 'withdraw')}
                        disabled={busy !== ''}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {busy === `withdraw:${story._id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                        {story.status === 'published' ? t('writer.list.takeDown') : t('writer.list.takeBack')}
                      </button>
                    )}
                    <Link
                      to={`/writer/articles/${story._id}/edit`}
                      className="rounded-lg p-2 text-[var(--color-brand-text)] hover:bg-[var(--color-brand-light)]"
                      aria-label={t('writer.editArticle')}
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>
                    {story.actions.includes('delete') && (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(story)}
                        className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                        aria-label={t('writer.list.delete')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-text-muted)]">
                  <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{story.views.toLocaleString()}</span>
                  <span className="flex items-center gap-1" title={t('writer.list.validViewsHint')}>
                    <Check className="h-3.5 w-3.5" />{story.validViews.toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" />{story.likes.toLocaleString()}</span>
                  <span className="flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{story.commentsCount.toLocaleString()}</span>
                  {/* An unread story has no average to report; printing zero would
                      invent a measurement that was never taken. */}
                  {story.hasViewData ? (
                    <>
                      <span className="flex items-center gap-1">
                        <Timer className="h-3.5 w-3.5" />{averageRead(story.averageReadingDurationSeconds)} {t('writer.list.avgRead')}
                      </span>
                      <TrafficSpark series={story.traffic} />
                    </>
                  ) : (
                    <span className="flex items-center gap-1 italic"><Clock className="h-3.5 w-3.5" />{t('writer.list.notReadYet')}</span>
                  )}
                </div>
              </article>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
              <span>{t('writer.list.showing')} · {total.toLocaleString()} · {page} / {totalPages}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setField('page', String(page - 1))}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" /> {t('editor.queue.previous')}
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setField('page', String(page + 1))}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold disabled:opacity-40"
                >
                  {t('editor.queue.next')} <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        isOpen={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && void run(confirmDelete, 'delete')}
        title={t('writer.list.deleteTitle')}
        message={t('writer.list.deleteBody')}
        confirmLabel={t('writer.list.delete')}
        cancelLabel={t('profile.cancel')}
        variant="destructive"
        isLoading={busy.startsWith('delete:')}
      />
    </div>
  )
}

// Fourteen days of real traffic, scaled to the busiest day in the series. Days
// with no reads stay as bare tracks so the flat stretches are visible too.
function TrafficSpark({ series }: { series: { day: string; validViews: number }[] }) {
  const peak = Math.max(...series.map((point) => point.validViews), 1)
  return (
    <span className="flex items-end gap-0.5">
      {series.map((point) => (
        <span
          key={point.day}
          title={`${point.day}: ${point.validViews}`}
          className="w-1 rounded-t bg-blue-500"
          style={{ height: `${Math.max(2, Math.round((point.validViews / peak) * 14))}px`, opacity: point.validViews ? 0.9 : 0.15 }}
        />
      ))}
    </span>
  )
}
