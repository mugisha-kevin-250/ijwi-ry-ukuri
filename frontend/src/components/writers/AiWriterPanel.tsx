import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Check, Sparkles } from 'lucide-react'
import { aiAPI, publicAPI, writerAPI, type AiStatus } from '../../services/api'
import { useI18n } from '../../context/I18nContext'

/**
 * The AI writer, on an author's own dashboard.
 *
 * The admin newsroom has had this tool since it was built. The request now is
 * that every writer can use it too - so this is the same Gemini behind the same
 * key, reached through the author's own account, with the two things that make
 * it a newsroom tool rather than a text box kept intact:
 *
 * - Generating costs a paid call and writes nothing. The author reads what the
 *   machine makes and can throw it away.
 * - Saving makes a draft that belongs to them, filed under their name, in
 *   `draft`. There is no publish button here. It leaves their shelf the same way
 *   their own writing does: submit, and an editor decides.
 *
 * The category list is read from the public sections API because a draft has to
 * be filed somewhere real - an invented category would fail at save time and
 * the author would only find out when they pressed the button.
 */
interface Draft {
  title: string
  summary: string
  content: string
  tags?: string[]
  metaDescription?: string
  model?: string
}

interface Option {
  _id: string
  name: string
}

export default function AiWriterPanel() {
  const { t } = useI18n()
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [options, setOptions] = useState<Option[]>([])
  const [topic, setTopic] = useState('')
  const [angle, setAngle] = useState('')
  const [audience, setAudience] = useState<'rwanda' | 'world'>('rwanda')
  const [category, setCategory] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [savedTo, setSavedTo] = useState<{ id: string; title: string } | null>(null)

  useEffect(() => {
    let alive = true
    void aiAPI.status().then((next) => {
      if (alive) setStatus(next)
    })
    void publicAPI.getCategories().then((response: any) => {
      if (!alive) return
      const data = response?.data?.data || response?.data || {}
      const list = Array.isArray(data.categories) ? data.categories : Array.isArray(data) ? data : []
      setOptions(list.filter((row: Option) => row && row._id && row.name))
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!category && options.length) setCategory(options[0]._id)
  }, [options, category])

  const generate = async () => {
    if (topic.trim().length < 6) {
      setMessage(t('writer.ai.topicShort'))
      return
    }
    setBusy(true)
    setMessage('')
    setDraft(null)
    try {
      const response: any = await writerAPI.generateAiDraft({ topic: topic.trim(), angle: angle.trim(), audience })
      const payload = (response?.data?.data || {}) as Draft
      if (!payload?.title || !payload?.content) {
        setMessage(t('writer.ai.empty'))
      } else {
        setDraft(payload)
      }
    } catch (error: any) {
      setMessage(error?.response?.data?.message || t('writer.ai.failed'))
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!draft || !category) return
    setSaving(true)
    setMessage('')
    try {
      const response: any = await writerAPI.saveAiDraft({
        title: draft.title,
        summary: draft.summary,
        content: draft.content,
        category,
        tags: draft.tags || [],
        metaDescription: draft.metaDescription || ''
      })
      const article = response?.data?.data?.article
      if (article?._id) {
        setSavedTo({ id: article._id, title: article.title || draft.title })
        setDraft(null)
      } else {
        setMessage(t('writer.ai.saveFailed'))
      }
    } catch (error: any) {
      setMessage(error?.response?.data?.message || t('writer.ai.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const modelNote = status?.model ? `${t('writer.ai.model')} ${status.model}` : ''

  return (
    <section className="card space-y-4 p-5">
      <header className="flex items-start gap-3">
        <span className="rounded-lg bg-blue-50 p-2 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200">
          <Sparkles className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-base font-extrabold text-[var(--color-text)]">{t('writer.ai.title')}</h2>
          <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">{t('writer.ai.body')}</p>
        </div>
      </header>

      {status === null && (
        <p className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
          {t('writer.ai.checking')}
        </p>
      )}

      {status && !status.configured && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {t('writer.ai.off')}
        </p>
      )}

      {status?.configured && savedTo && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <Check className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate font-semibold">{t('writer.ai.saved')} {savedTo.title}</span>
          <Link to={`/writer/articles/${savedTo.id}/edit`} className="font-bold underline">
            {t('writer.ai.edit')}
          </Link>
          <Link to="/writer/articles" className="font-bold underline">{t('writer.ai.shelf')}</Link>
        </div>
      )}

      {status?.configured && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-[var(--color-text)]">
              {t('writer.ai.topic')}
              <input
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder={t('writer.ai.topicPlaceholder')}
                className="input-field mt-1 w-full"
              />
            </label>
            <label className="block text-sm font-semibold text-[var(--color-text)]">
              {t('writer.ai.angle')}
              <input
                value={angle}
                onChange={(event) => setAngle(event.target.value)}
                placeholder={t('writer.ai.anglePlaceholder')}
                className="input-field mt-1 w-full"
              />
            </label>
            <label className="block text-sm font-semibold text-[var(--color-text)]">
              {t('writer.ai.section')}
              <select value={category} onChange={(event) => setCategory(event.target.value)} className="input-field mt-1 w-full">
                {options.length === 0 && <option value="">{t('writer.ai.noSections')}</option>}
                {options.map((option) => (
                  <option key={option._id} value={option._id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold text-[var(--color-text)]">
              {t('writer.ai.audience')}
              <select value={audience} onChange={(event) => setAudience(event.target.value as 'rwanda' | 'world')} className="input-field mt-1 w-full">
                <option value="rwanda">{t('writer.ai.audienceRwanda')}</option>
                <option value="world">{t('writer.ai.audienceWorld')}</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void generate()}
              disabled={busy}
              className="btn-primary inline-flex items-center gap-2 disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4" />
              {busy ? t('writer.ai.writing') : t('writer.ai.generate')}
            </button>
            {modelNote && <span className="text-xs text-[var(--color-text-muted)]">{modelNote}</span>}
          </div>

          {message && <p className="text-sm font-semibold text-red-600">{message}</p>}

          {draft && (
            <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-800 dark:bg-blue-900/20">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-800 dark:text-blue-200">
                {t('writer.ai.draftHeader')}
              </p>
              <h3 className="text-lg font-extrabold text-[var(--color-text)]">{draft.title}</h3>
              <p className="text-sm font-medium text-[var(--color-text-muted)]">{draft.summary}</p>
              <div className="max-h-72 overflow-y-auto whitespace-pre-line text-sm text-[var(--color-text)]">
                {draft.content}
              </div>
              {Array.isArray(draft.tags) && draft.tags.length > 0 && (
                <p className="text-xs text-[var(--color-text-muted)]">{t('writer.ai.tags')}: {draft.tags.join(', ')}</p>
              )}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving || !category}
                  className="btn-primary inline-flex items-center gap-2 disabled:opacity-60"
                >
                  {t('writer.ai.save')}
                </button>
                <button type="button" onClick={() => setDraft(null)} className="text-sm font-bold underline">
                  {t('writer.ai.discard')}
                </button>
                <span className="text-xs text-[var(--color-text-muted)]">{t('writer.ai.noPublish')}</span>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
