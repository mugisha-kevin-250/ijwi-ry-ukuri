import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ExternalLink, FileText, Loader2, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import { adminAPI, publicAPI, type AiDraftResult, type AiWriterStatus } from '../../services/api'
import type { Article, Category } from '../../types'
import { useI18n } from '../../context/I18nContext'
import { categoryLabel, canonicalCategoryId, resolveCategories } from '../../data/categoryVisuals'
import { ConfirmDialog } from '../../components/common/Modal'

const STATUS_PILLS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  pending_review: 'bg-amber-50 text-amber-700',
  approved: 'bg-sky-50 text-sky-700',
  rejected: 'bg-red-50 text-red-700',
  published: 'bg-emerald-50 text-emerald-700',
  archived: 'bg-slate-100 text-slate-500',
}

const LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_review: 'Waiting for review',
  approved: 'Approved',
  rejected: 'Rejected',
  published: 'Published',
  archived: 'Archived',
}

function Field({
  id,
  label,
  hint,
  value,
  onChange,
  placeholder,
  rows,
}: {
  id: string
  label: string
  hint?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</label>
      {rows ? (
        <textarea
          id={id}
          value={value}
          rows={rows}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
      ) : (
        <input
          id={id}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
      )}
      {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

export default function AdminAiWriterPage() {
  const { t } = useI18n()
  const [status, setStatus] = useState<AiWriterStatus | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [stories, setStories] = useState<Article[]>([])
  const [pendingReview, setPendingReview] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [topic, setTopic] = useState('')
  const [angle, setAngle] = useState('')
  const [audience, setAudience] = useState<'rwanda' | 'world'>('rwanda')
  const [generating, setGenerating] = useState(false)

  const [draft, setDraft] = useState<AiDraftResult | null>(null)
  const [savedId, setSavedId] = useState('')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [body, setBody] = useState('')
  const [tags, setTags] = useState('')
  const [category, setCategory] = useState('')
  const [saving, setSaving] = useState(false)

  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [removing, setRemoving] = useState<Article | null>(null)

  const sections = useMemo(() => resolveCategories(categories), [categories])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    const [statusResult, categoryResult, storyResult] = await Promise.allSettled([
      adminAPI.getAiStatus(),
      publicAPI.getCategories(),
      adminAPI.getAiArticles()
    ])
    if (statusResult.status === 'fulfilled') setStatus(statusResult.value)
    else setLoadError('Only the site owner can open the AI writer.')
    if (categoryResult.status === 'fulfilled') {
      const payload = categoryResult.value.data.data as { categories?: Category[] } | Category[]
      setCategories(Array.isArray(payload) ? payload : payload?.categories ?? [])
    }
    if (storyResult.status === 'fulfilled') {
      setStories(storyResult.value.articles)
      setPendingReview(storyResult.value.pendingReview)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const persist = async (input: { title: string; summary: string; content: string; tags: string[]; category: string }, publish: boolean): Promise<Article | null> => {
    if (!input.title.trim() || !input.summary.trim() || !input.content.trim() || !input.category) {
      setError('A headline, a summary, a body and a section are all needed.')
      return null
    }
    try {
      const article = await adminAPI.saveAiArticle({
        ...input,
        title: input.title.trim(),
        summary: input.summary.trim(),
        content: input.content.trim(),
        category: canonicalCategoryId(categories, input.category),
        publish
      })
      setNotice(publish ? 'Story published to readers.' : 'Story saved as a draft.')
      return article
    } catch (err: any) {
      setError(err?.response?.data?.message || 'The story could not be saved.')
      return null
    }
  }

  const generate = async () => {
    setError('')
    setNotice('')
    if (topic.trim().length < 6) {
      setError('Describe the topic in a few words first.')
      return
    }
    setGenerating(true)
    try {
      const story = await adminAPI.generateAiDraft({
        topic: topic.trim(),
        angle: angle.trim() || undefined,
        audience
      })
      const chosenCategory = category || String(sections[0]?.category._id || '')
      setDraft(story)
      setSavedId('')
      setTitle(story.title)
      setSummary(story.summary)
      setBody(story.paragraphs.join('\n\n'))
      setTags(story.tags.join(', '))
      setCategory(chosenCategory)
      // Auto mode is the owner's own decision to skip the review step, so the
      // story goes straight out and stays editable in the list below.
      if (status?.autoPublish && chosenCategory) {
        const created = await persist({
          title: story.title,
          summary: story.summary,
          content: story.paragraphs.join('\n\n'),
          tags: story.tags,
          category: chosenCategory
        }, true)
        if (created) {
          setSavedId(created._id)
          // The story is already with readers, so the list has to show it now.
          await load()
        }
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Gemini could not write this story. Try a different topic.')
    } finally {
      setGenerating(false)
    }
  }

  const save = async (publish: boolean) => {
    setError('')
    setNotice('')
    setSaving(true)
    const created = await persist({ title, summary, content: body, tags: tags.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean).slice(0, 6), category }, publish)
    if (created) {
      setDraft(null)
      setSavedId('')
      setTopic('')
      setAngle('')
      setTitle('')
      setSummary('')
      setBody('')
      setTags('')
      await load()
    }
    setSaving(false)
  }

  const toggleAutoPublish = async () => {
    if (!status) return
    const next = !status.autoPublish
    setError('')
    try {
      await adminAPI.setAiAutoPublish(next)
      setStatus({ ...status, autoPublish: next })
    } catch (err: any) {
      setError(err?.response?.data?.message || 'The setting could not be saved.')
    }
  }

  const changeStatus = async (article: Article, next: string) => {
    setBusyId(article._id)
    setError('')
    try {
      await adminAPI.updateArticleStatus(article._id, next)
      await load()
    } catch (err: any) {
      setError(err?.response?.data?.message || 'The story status could not be changed.')
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

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-blue-700">Newsroom</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">AI story writer</h1>
          <p className="mt-1 text-sm text-slate-500">
            Type a topic and Gemini writes a report you can read, edit and then publish.
          </p>
          {status?.model && (
            <p className="mt-2 text-xs text-slate-400">Model: {status.model}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loadError && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {loadError}
        </div>
      )}

      {status && !status.configured && (
        <div className="flex gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="text-sm text-slate-700">
            <p className="font-bold text-slate-900">Gemini is not connected yet</p>
            <p className="mt-1 text-slate-600">
              Add <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono">GEMINI_API_KEY</code> to the
              server environment and restart the backend. Until then no story can be written here.
            </p>
          </div>
        </div>
      )}

      {status?.configured && (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-bold text-slate-900">What should the story cover?</h2>
                <p className="text-xs text-slate-500">Gemini writes in English and never invents quotes, names or figures.</p>
              </div>
            </div>

            <div className="space-y-4">
              <Field
                id="aiTopic"
                label="Topic"
                value={topic}
                onChange={setTopic}
                placeholder="Rwanda's coffee exports reach a record season"
                rows={2}
              />
              <Field
                id="aiAngle"
                label="Editorial angle (optional)"
                hint="Who the story affects, what to lead with, what to leave out."
                value={angle}
                onChange={setAngle}
                placeholder="Focus on smallholder farmers' incomes in Huye"
                rows={2}
              />
              <div>
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">Audience</span>
                <div className="flex gap-1.5">
                  {(['rwanda', 'world'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setAudience(option)}
                      className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                        audience === option ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {option === 'rwanda' ? 'Rwanda first' : 'International'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void generate()}
              disabled={generating}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-500 disabled:opacity-60"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? 'Gemini is writing…' : 'Write the story'}
            </button>
            {generating && (
              <p className="mt-2 text-xs text-slate-500">A report can take up to a minute. Keep this page open.</p>
            )}
          </section>

          {draft && (
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-bold text-slate-900">{savedId ? 'Now live — check it reads well' : 'Read it before anyone does'}</h2>
              <p className="mt-1 text-xs text-slate-500">
                {savedId
                  ? 'Auto mode published this story as soon as Gemini finished. Open it in the editor to fix anything.'
                  : 'Nothing reaches a reader until you save it. Check every fact and fix the wording.'}
              </p>
              <div className="mt-4 space-y-4">
                <Field id="aiTitle" label="Headline" value={title} onChange={setTitle} />
                <Field id="aiSummary" label="Summary" hint="Shown as the standfirst under the headline." value={summary} onChange={setSummary} rows={3} />
                <Field id="aiBody" label="Body" hint="Leave one empty line between paragraphs." value={body} onChange={setBody} rows={16} />
                <Field id="aiTags" label="Tags" hint="Comma separated." value={tags} onChange={setTags} />
                <div>
                  <label htmlFor="aiCategory" className="mb-1.5 block text-sm font-semibold text-slate-700">Section</label>
                  <select
                    id="aiCategory"
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  >
                    {sections.map((section) => (
                      <option key={String(section.category._id)} value={String(section.category._id)}>
                        {categoryLabel(section.category, t)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {savedId ? (
                <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-5">
                  <Link
                    to={`/writer/articles/${savedId}/edit`}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-500"
                  >
                    Open in the editor
                  </Link>
                </div>
              ) : (
                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void save(false)}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    <FileText className="h-4 w-4" />
                    Save as draft
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void save(true)}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Publish now
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDraft(null); setNotice('') }}
                    className="rounded-lg px-4 py-2.5 text-sm font-bold text-slate-500 transition hover:bg-slate-100"
                  >
                    Discard
                  </button>
                </div>
              )}
            </section>
          )}

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-slate-900">Publish AI stories without review</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {status.autoPublish
                    ? 'On: a generated story is published and announced as soon as Gemini finishes. Only use this for topics you have checked yourself.'
                    : 'Off: a generated story waits here until you choose to save or publish it.'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={status.autoPublish}
                onClick={() => void toggleAutoPublish()}
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${status.autoPublish ? 'bg-emerald-600' : 'bg-slate-300'}`}
              >
                <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${status.autoPublish ? 'translate-x-5' : ''}`} />
              </button>
            </div>
          </section>
        </>
      )}

      {notice && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {notice}
        </div>
      )}
      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} className="font-bold underline">Dismiss</button>
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h2 className="font-bold text-slate-900">Stories written here</h2>
          {pendingReview > 0 && (
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
              {pendingReview} waiting for you
            </span>
          )}
        </div>

        {loading ? (
          <div className="space-y-3 p-5">
            {[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}
          </div>
        ) : stories.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">No AI stories yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {stories.map((article) => {
              const busy = busyId === article._id
              return (
                <li key={article._id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-900">{article.title}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className={`rounded-full px-2 py-0.5 font-bold ${STATUS_PILLS[article.status] || 'bg-slate-100 text-slate-600'}`}>
                        {LABELS[article.status] || article.status}
                      </span>
                      <span>{new Date(article.createdAt).toLocaleString()}</span>
                      <span>{Math.round(String(article.content || '').split(/\s+/).filter(Boolean).length)} words</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
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
                          onClick={() => void changeStatus(article, 'draft')}
                          className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-200 disabled:opacity-60"
                        >
                          Take down
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void changeStatus(article, 'published')}
                        className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-500 disabled:opacity-60"
                      >
                        Publish
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
                      className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <ConfirmDialog
        isOpen={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => void remove()}
        title={`Delete — ${removing?.title || ''}`}
        message="This removes the story from the site for good. Readers who already saw it will get a missing page."
        confirmLabel="Delete story"
        cancelLabel={t('profile.cancel')}
        variant="destructive"
        isLoading={!!busyId}
      />
    </div>
  )
}
