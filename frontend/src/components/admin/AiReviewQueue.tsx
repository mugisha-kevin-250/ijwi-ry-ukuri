import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ExternalLink, Eye, RefreshCw, Trash2, X } from 'lucide-react'
import { adminAPI } from '../../services/api'
import type { Article } from '../../types'
import Modal, { ConfirmDialog } from '../common/Modal'

/**
 * The only door between a machine's draft and a reader.
 *
 * Nothing Gemini wrote is published by this server on its own: a story appears
 * here and leaves only when the admin clicks. The panel keeps the words,
 * section and search snippet visible so the decision is made on what readers
 * would actually get, and a rejected draft stays readable instead of vanishing.
 */

const STATUSES = ['waiting', 'published', 'rejected', 'all'] as const
type StatusFilter = (typeof STATUSES)[number]

const LABELS: Record<StatusFilter, string> = {
  waiting: 'Waiting for you',
  published: 'Live',
  rejected: 'Rejected',
  all: 'Everything',
}

const PILL: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  pending_review: 'bg-amber-50 text-amber-700',
  approved: 'bg-sky-50 text-sky-700',
  rejected: 'bg-red-50 text-red-700',
  published: 'bg-emerald-50 text-emerald-700',
  archived: 'bg-slate-100 text-slate-500',
}

const STATE: Record<string, string> = {
  draft: 'Draft',
  pending_review: 'Waiting for approval',
  approved: 'Approved, not published',
  rejected: 'Rejected',
  published: 'Live',
  archived: 'Taken down',
}

const IN_QUEUE = ['draft', 'pending_review', 'approved']

function words(text: string): number {
  return String(text || '').split(/\s+/).filter(Boolean).length
}

function paragraphs(text: string): string[] {
  return String(text || '').split(/\n{2,}/).map((block) => block.trim()).filter(Boolean)
}

function categoryOf(article: Article): string {
  return typeof article.category === 'object' && article.category ? article.category.name : ''
}

export default function AiReviewQueue({ reloadKey = 0 }: { reloadKey?: number }) {
  const [stories, setStories] = useState<Article[]>([])
  const [filter, setFilter] = useState<StatusFilter>('waiting')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<Article | null>(null)
  const [removing, setRemoving] = useState<Article | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await adminAPI.getAiArticles()
      setStories(result.articles)
    } catch (err: any) {
      setError(err?.response?.data?.message || 'The review queue could not be read.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, reloadKey])

  const moveTo = async (article: Article, status: string) => {
    setBusyId(article._id)
    setError('')
    try {
      await adminAPI.updateArticleStatus(article._id, status)
      await load()
    } catch (err: any) {
      setError(err?.response?.data?.message || 'The story could not be moved.')
    } finally {
      setBusyId('')
    }
  }

  const remove = async () => {
    const article = removing
    if (!article) return
    setBusyId(article._id)
    setError('')
    try {
      await adminAPI.deleteArticle(article._id)
      setRemoving(null)
      await load()
    } catch (err: any) {
      setError(err?.response?.data?.message || 'The story could not be deleted.')
    } finally {
      setBusyId('')
    }
  }

  const visible = stories.filter((article) => {
    if (filter === 'all') return true
    if (filter === 'published') return article.status === 'published'
    if (filter === 'rejected') return article.status === 'rejected'
    return IN_QUEUE.includes(article.status)
  })
  const waitingCount = stories.filter((article) => IN_QUEUE.includes(article.status)).length

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="ai-queue-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 id="ai-queue-heading" className="font-bold text-slate-900">
            Pending admin approval
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {waitingCount > 0
              ? `${waitingCount} ${waitingCount === 1 ? 'story is' : 'stories are'} waiting on your decision. A story cannot reach a reader from anywhere else.`
              : 'Nothing is waiting. Every AI story here has been decided by you.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Reload
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-5 py-3">
        {STATUSES.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setFilter(option)}
            aria-pressed={filter === option}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
              filter === option ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {LABELS[option]}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
      )}

      {loading && stories.length === 0 ? (
        <div className="space-y-3 p-5">
          {[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}
        </div>
      ) : visible.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500">
          {filter === 'waiting' ? 'No drafts are waiting.' : 'Nothing here.'}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {visible.map((article) => {
            const busy = busyId === article._id
            const waiting = IN_QUEUE.includes(article.status)
            return (
              <li key={article._id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">{article.title}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className={`rounded-full px-2 py-0.5 font-bold ${PILL[article.status] || 'bg-slate-100 text-slate-600'}`}>
                      {STATE[article.status] || article.status}
                    </span>
                    <span>{new Date(article.createdAt).toLocaleString()}</span>
                    <span>{words(article.content)} words</span>
                    {categoryOf(article) && <span>{categoryOf(article)}</span>}
                  </p>
                  <p className="mt-1.5 line-clamp-2 text-xs text-slate-600">{article.summary}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreview(article)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                  >
                    <Eye className="h-3.5 w-3.5" /> Preview
                  </button>
                  {article.status === 'published' ? (
                    <>
                      <Link
                        to={`/article/${article.slug}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-50"
                      >
                        View <ExternalLink className="h-3 w-3" />
                      </Link>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void moveTo(article, 'archived')}
                        className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-200 disabled:opacity-60"
                      >
                        Take down
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void moveTo(article, 'published')}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-500 disabled:opacity-60"
                    >
                      <Check className="h-3.5 w-3.5" />
                      {waiting ? 'Approve & publish' : 'Publish'}
                    </button>
                  )}
                  {waiting && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void moveTo(article, 'rejected')}
                      className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                    >
                      <X className="h-3.5 w-3.5" /> Reject
                    </button>
                  )}
                  {article.status === 'rejected' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void moveTo(article, 'draft')}
                      className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-200 disabled:opacity-60"
                    >
                      Re-open as draft
                    </button>
                  )}
                  <Link
                    to={`/writer/articles/${article._id}/edit`}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                  >
                    Edit
                  </Link>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setRemoving(article)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-400 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="sr-only">Delete</span>
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Modal isOpen={!!preview} onClose={() => setPreview(null)} title="Exactly what a reader would see" size="full">
        {preview && (
          <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
              {categoryOf(preview) || 'Section'} · written by Gemini
            </p>
            <h3 className="mt-2 text-2xl font-extrabold leading-snug text-slate-900">{preview.title}</h3>
            <p className="mt-2 text-sm font-medium text-slate-600">{preview.summary}</p>

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Search result</p>
              <p className="mt-1 truncate text-sm font-semibold text-blue-800">{preview.title}</p>
              <p className="text-xs text-emerald-700">ijwi-ry--ukuri.web.app › article › {preview.slug}</p>
              <p className="mt-0.5 text-xs text-slate-600">
                {preview.metaDescription || (
                  <span className="italic text-amber-700">
                    No meta description — Google will pick its own sentence out of the story.
                  </span>
                )}
              </p>
              {preview.metaDescription && preview.metaDescription.length > 155 && (
                <p className="mt-1 text-xs font-semibold text-red-700">
                  {preview.metaDescription.length} characters — search engines cut it at about 155.
                </p>
              )}
            </div>

            <div className="mt-4 space-y-3.5 text-[15px] leading-7 text-slate-800">
              {paragraphs(preview.content).map((block, index) => <p key={index}>{block}</p>)}
            </div>

            {preview.sourceResearch && (
              <section className="mt-6 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                <h4 className="text-sm font-bold text-slate-900">Publisher research & provenance</h4>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-700">
                    Source extraction: {preview.sourceResearch.extractionStatus || 'unknown'}
                  </span>
                  {preview.sourceResearch.usedFullSource && (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-800">Full source used</span>
                  )}
                  {!!preview.sourceResearch.sourceWordCount && (
                    <span className="rounded-full bg-white px-2.5 py-1 text-slate-600">
                      {preview.sourceResearch.sourceWordCount.toLocaleString()} source words
                    </span>
                  )}
                </div>
                {(preview.sourceResearch.sourceAuthor || preview.sourceResearch.sourcePublishedAt) && (
                  <p className="mt-2 text-xs text-slate-600">
                    {preview.sourceResearch.sourceAuthor ? `By ${preview.sourceResearch.sourceAuthor}` : ''}
                    {preview.sourceResearch.sourceAuthor && preview.sourceResearch.sourcePublishedAt ? ' · ' : ''}
                    {preview.sourceResearch.sourcePublishedAt || ''}
                  </p>
                )}
                {preview.sourceResearch.originalUrl && (
                  <a href={preview.sourceResearch.originalUrl} target="_blank" rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline">
                    Open original publisher article <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  Publisher claims still require editorial verification. Check image reuse rights and attribution before publication.
                </p>
              </section>
            )}

            {((preview.sources?.length || 0) > 0 || preview.featuredImage || (preview.media?.length || 0) > 0) && (
              <section className="mt-5 rounded-xl border border-slate-200 p-4">
                <h4 className="text-sm font-bold text-slate-900">Source links & images</h4>
                {preview.sources?.length ? (
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {preview.sources.map((source, index) => (
                      <li key={source._id || source.url || index}>
                        {source.url ? (
                          <a href={source.url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
                            {source.organization || source.title || 'Open source'} <ExternalLink className="inline h-3 w-3" />
                          </a>
                        ) : <span className="text-slate-600">{source.title || 'Source'}</span>}
                        {source.verificationStatus && <span className="ml-2 text-xs text-slate-500">({source.verificationStatus})</span>}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {preview.featuredImage && (
                    <div className="min-w-0">
                      <img src={preview.featuredImage} alt={preview.imageCaption || 'Publisher supplied featured image'} className="h-36 w-full rounded-lg object-cover" />
                      <p className="mt-1 text-xs text-slate-600">{preview.imageCredit || 'Publisher image'}{preview.imageCaption ? ` · ${preview.imageCaption}` : ''}</p>
                      <a href={preview.imageSourceUrl || preview.featuredImage} target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-700 hover:underline">Open image/source link</a>
                    </div>
                  )}
                  {(preview.media || []).filter((item) => item.kind === 'image').map((item, index) => (
                    <div key={item._id || item.url || index} className="min-w-0">
                      <img src={item.url} alt={item.caption || 'Publisher supplied image'} className="h-36 w-full rounded-lg object-cover" />
                      <p className="mt-1 text-xs text-slate-600">{item.credit || 'Publisher image'}{item.caption ? ` · ${item.caption}` : ''}</p>
                      <a href={item.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-700 hover:underline">Open original image</a>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {preview.tags?.length > 0 && (
              <p className="mt-4 flex flex-wrap gap-1.5">
                {preview.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">#{tag}</span>
                ))}
              </p>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => void remove()}
        title={`Delete — ${removing?.title || ''}`}
        message="This removes the story for good. A rejected draft keeps its record; a deleted one keeps nothing."
        confirmLabel="Delete story"
        cancelLabel="Keep it"
        variant="destructive"
        isLoading={!!busyId}
      />
    </section>
  )
}
