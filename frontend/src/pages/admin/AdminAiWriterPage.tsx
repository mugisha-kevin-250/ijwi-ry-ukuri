import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Ref } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, FileText, RefreshCw, Sparkles } from 'lucide-react'
import { apiClient } from '../../services/apiClient'
import { adminAPI, publicAPI, type AiDraftResult, type AiWriterStatus, type RadarAutoManageStatus } from '../../services/api'
import type { Article, Category } from '../../types'
import { useI18n } from '../../context/I18nContext'
import { canonicalCategoryId, resolveCategories } from '../../data/categoryVisuals'
import { sectionHrefFor } from '../../data/sections'
import AiReviewQueue from '../../components/admin/AiReviewQueue'
import AiPhotoPicker from '../../components/admin/AiPhotoPicker'
import AiResearchChat from '../../components/admin/AiResearchChat'
import TrendRadar from '../../components/admin/TrendRadar'

/** The section tree as the server sends it, with the stored document behind each node. */
interface TreeSection {
  _id: string | null
  slug: string
  name?: string
  labelKey?: string
  children?: TreeSection[]
}

interface SectionChoice {
  id: string
  href: string
  label: string
  group: string
}

/**
 * Every section a story can be filed under, sub-sections included, so an AI
 * story can be put on /sports/football and not only on /sports. A node the
 * database has no document for is left out - there would be nothing to save.
 */
function buildSectionChoices(tree: TreeSection[], labelOf: (node: TreeSection) => string): SectionChoice[] {
  const choices: SectionChoice[] = []
  tree.forEach((section) => {
    const group = labelOf(section)
    if (section._id) choices.push({ id: String(section._id), href: `/${section.slug}`, label: group, group })
    const children = section.children || []
    children.forEach((child) => {
      if (!child._id) return
      choices.push({
        id: String(child._id),
        href: `/${section.slug}/${child.slug}`,
        label: `   ${labelOf(child)}`,
        group,
      })
    })
  })
  return choices
}

function Field({
  id,
  label,
  hint,
  value,
  onChange,
  placeholder,
  rows,
  counter,
  fieldRef,
}: {
  id: string
  label: string
  hint?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  counter?: number
  fieldRef?: Ref<HTMLTextAreaElement | HTMLInputElement>
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between gap-3 text-sm font-semibold text-slate-700">
        <span>{label}</span>
        {counter !== undefined && (
          <span className={`text-xs font-normal ${value.length > counter ? 'text-red-600' : 'text-slate-400'}`}>
            {value.length}/{counter}
          </span>
        )}
      </label>
      {rows ? (
        <textarea
          id={id}
          ref={fieldRef as Ref<HTMLTextAreaElement>}
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
          ref={fieldRef as Ref<HTMLInputElement>}
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
  const [autoManage, setAutoManage] = useState<RadarAutoManageStatus | null>(null)
  const [autoManageBusy, setAutoManageBusy] = useState(false)
  const [storageSnapshot, setStorageSnapshot] = useState<{ usedMB: number; remainingMB: number; capacityMB: number; usedPercent: number; uploadStorage: { usedMB: number; remainingMB: number; capacityMB: number; usedPercent: number } } | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [sectionTree, setSectionTree] = useState<TreeSection[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  // Bumped when a save lands, so the review queue below shows it immediately.
  const [queueKey, setQueueKey] = useState(0)

  const [topic, setTopic] = useState('')
  const [angle, setAngle] = useState('')
  const [audience, setAudience] = useState<'rwanda' | 'world'>('rwanda')
  const [generating, setGenerating] = useState(false)
  // Set when the topic came from the trending list. The server only writes a
  // trend story for a topic its own fetch really received from Google.
  const [trend, setTrend] = useState<{ geo: string; topic: string } | null>(null)
  const topicField = useRef<HTMLTextAreaElement>(null)

  const [draft, setDraft] = useState<AiDraftResult | null>(null)
  const [savedId, setSavedId] = useState('')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [meta, setMeta] = useState('')
  const [body, setBody] = useState('')
  const [tags, setTags] = useState('')
  const [category, setCategory] = useState('')
  // The picture the trend feed printed beside the headline, and the publisher it
  // credited. Kept separate from the text so a borrowed photo always says whose
  // it is instead of arriving as an unnamed image.
  const [image, setImage] = useState('')
  const [imageCredit, setImageCredit] = useState('')
  const [imageSourceUrl, setImageSourceUrl] = useState('')
  const [saving, setSaving] = useState(false)

  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  /** Sections the site has, then any stored category the tree does not cover. */
  const choices = useMemo(() => {
    const labelOf = (node: TreeSection) => {
      const translated = node.labelKey ? t(node.labelKey) : ''
      return translated && translated !== node.labelKey ? translated : node.name || node.slug
    }
    const tree = buildSectionChoices(sectionTree, labelOf)
    const used = new Set(tree.map((choice) => choice.href))
    const legacy = resolveCategories(categories)
      .filter((item) => item.category._id)
      .map((item) => ({
        id: String(item.category._id),
        href: sectionHrefFor(item.category) || `/category/${item.category.slug}`,
        label: item.category.name || String(item.category.slug),
        group: 'Other stored sections',
      }))
      .filter((choice) => !used.has(choice.href))
    return [...tree, ...legacy]
  }, [categories, sectionTree, t])

  /** The section a saved story belongs to, printed with its address. */
  const grouped = useMemo(() => {
    const map = new Map<string, SectionChoice[]>()
    choices.forEach((choice) => {
      map.set(choice.group, [...(map.get(choice.group) || []), choice])
    })
    return [...map.entries()]
  }, [choices])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    const [statusResult, categoryResult, autoManageResult, storageResult] = await Promise.allSettled([
      adminAPI.getAiStatus(),
      publicAPI.getCategories(),
      adminAPI.getRadarAutoManage(),
      apiClient.get('/admin/system/storage')
    ])
    if (statusResult.status === 'fulfilled') setStatus(statusResult.value)
    else setLoadError('Only staff with AI writer access can open the AI writer.')
    if (autoManageResult.status === 'fulfilled') setAutoManage(autoManageResult.value)
    if (storageResult.status === 'fulfilled') setStorageSnapshot(((storageResult.value.data as any)?.data || storageResult.value.data) as typeof storageSnapshot)
    if (categoryResult.status === 'fulfilled') {
      const payload = categoryResult.value.data.data as
        | { categories?: Category[]; sections?: TreeSection[] }
        | Category[]
      if (!Array.isArray(payload)) {
        setSectionTree(payload?.sections ?? [])
        setCategories(payload?.categories ?? [])
      } else {
        setCategories(payload)
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const persist = async (
    input: {
      title: string
      summary: string
      metaDescription?: string
      content: string
      tags: string[]
      category: string
      featuredImage?: string
      imageCredit?: string
      imageSourceUrl?: string
    },
    publish: boolean,
  ): Promise<Article | null> => {
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
        featuredImage: input.featuredImage?.trim() || undefined,
        // A picture with no owner named is a picture the site would be claiming.
        imageCredit: input.featuredImage?.trim() ? input.imageCredit?.trim() || 'Source image' : undefined,
        imageSourceUrl: input.featuredImage?.trim() ? input.imageSourceUrl?.trim() || undefined : undefined,
        publish
      })
      setNotice(publish ? 'Story published to readers.' : 'Story saved as a draft.')
      setQueueKey((key) => key + 1)
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
      const story = trend
        ? await adminAPI.generateTrendDraft({
          geo: trend.geo,
          topic: trend.topic,
          angle: angle.trim() || undefined,
          audience
        })
        : await adminAPI.generateAiDraft({
          topic: topic.trim(),
          angle: angle.trim() || undefined,
          audience
        })
      // A story that came off the trending list belongs on the trending page
      // unless the admin moves it.
      const trendingChoice = trend ? choices.find((choice) => choice.href === '/trending') : undefined
      const chosenCategory = trendingChoice?.id || category || choices[0]?.id || ''
      setDraft(story)
      setSavedId('')
      setTitle(story.title)
      setSummary(story.summary)
      setMeta(story.metaDescription || '')
      setBody(story.paragraphs.join('\n\n'))
      setTags(story.tags.join(', '))
      setCategory(chosenCategory)
      // The photo is the one the feed printed with the headline. If Google named
      // no publisher for it, the story is published without a picture rather
      // than with an uncredited one.
      const photo = story.photo && story.photo.source ? story.photo : null
      setImage(photo?.url || '')
      setImageCredit(photo?.source || '')
      setImageSourceUrl(photo?.articleUrl || '')
      // Auto mode is the owner's own decision to skip the review step, so the
      // story goes straight out and stays editable in the list below.
      if (status?.autoPublish && chosenCategory) {
        const created = await persist({
          title: story.title,
          summary: story.summary,
          metaDescription: story.metaDescription || '',
          content: story.paragraphs.join('\n\n'),
          tags: story.tags,
          category: chosenCategory,
          featuredImage: photo?.url || '',
          imageCredit: photo?.source || '',
          imageSourceUrl: photo?.articleUrl || ''
        }, true)
        if (created) {
          setSavedId(created._id)
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
    const created = await persist({ title, summary, metaDescription: meta, content: body, tags: tags.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean).slice(0, 6), category, featuredImage: image, imageCredit, imageSourceUrl }, publish)
    if (created) {
      setDraft(null)
      setSavedId('')
      setTopic('')
      setAngle('')
      setTrend(null)
      setTitle('')
      setSummary('')
      setMeta('')
      setBody('')
      setTags('')
      setImage('')
      setImageCredit('')
      setImageSourceUrl('')
    }
    setSaving(false)
  }

  /** A topic picked from the trending list becomes the thing Gemini writes. */
  const chooseTrend = (value: string, geo: string) => {
    setTrend({ geo, topic: value })
    setTopic(value)
    setDraft(null)
    setSavedId('')
    setError('')
    setNotice('')
    topicField.current?.focus()
  }

  /**
   * A question asked at the research desk, moved up into the writer.
   *
   * Deliberately only fills the topic box: the admin still presses the button,
   * so a chat answer can never become a published story by itself.
   */
  const takeToWriter = (value: string) => {
    setTrend(null)
    setTopic(value.slice(0, 300))
    setNotice('The research question is in the topic box. Check it reads as a story before writing it.')
    topicField.current?.focus()
    topicField.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const toggleAutoManage = async () => {
    if (!autoManage || autoManageBusy) return
    setAutoManageBusy(true)
    setError('')
    try {
      const updated = await adminAPI.setRadarAutoManage(!autoManage.enabled)
      setAutoManage(updated)
      setNotice(updated.enabled
        ? 'RADAR AI Auto Manage is enabled. It will research Google Trends and RADAR Global News, then manage daily category coverage on the server, even when your device is offline.'
        : 'RADAR AI Auto Manage is switched off.')
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Auto Manage could not be updated.')
    } finally {
      setAutoManageBusy(false)
    }
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

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-blue-700">Newsroom</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">AI newsroom</h1>
          <p className="mt-1 text-sm text-slate-500">
            Write stories manually with editorial control, or enable Auto Manage for scheduled research and safeguarded automatic publishing.
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
          <RefreshCw className="h-4 w-4" />
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

      {autoManage && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="radar-auto-manage-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <h2 id="radar-auto-manage-title" className="font-bold text-slate-900">RADAR AI Auto Manage</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {autoManage.enabled ? 'Enabled on the server — researches and can publish eligible stories every 15 minutes without your browser.' : 'Off — enable the autonomous newsroom.'}
                </p>
              </div>
            </div>
            <button type="button" role="switch" aria-checked={autoManage.enabled} disabled={autoManageBusy || !autoManage.configured}
              onClick={() => void toggleAutoManage()}
              className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${autoManage.enabled ? 'bg-emerald-600' : 'bg-slate-300'}`}>
              <span className={`absolute left-0.5 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${autoManage.enabled ? 'translate-x-5' : ''}`} />
              <span className="sr-only">{autoManage.enabled ? 'Disable Auto Manage' : 'Enable Auto Manage'}</span>
            </button>
          </div>
          {!autoManage.configured && <p className="mt-3 text-xs text-amber-700">Connect GEMINI_API_KEY on the backend before enabling automation.</p>}
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold text-slate-800">MongoDB storage protection</p><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${storageSnapshot && storageSnapshot.usedPercent < 60 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{storageSnapshot ? `${storageSnapshot.usedPercent}% used` : 'Loading storage…'}</span></div>
            {storageSnapshot && <><p className="mt-2 text-xs text-slate-600">{storageSnapshot.usedMB} MB used · {storageSnapshot.remainingMB} MB remaining · {storageSnapshot.capacityMB} MB configured capacity</p><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className={`h-full ${storageSnapshot.usedPercent >= 60 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, storageSnapshot.usedPercent)}%` }} /></div><p className="mt-2 text-xs text-slate-500">Uploaded media: {storageSnapshot.uploadStorage.usedMB} / {storageSnapshot.uploadStorage.capacityMB} MB · {storageSnapshot.uploadStorage.remainingMB} MB free. Cleanup triggers above 60% and targets 55%.</p></>}
          </div>

          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-600">
            This is a server-side autonomous newsroom manager. Every 15 minutes it checks Google Trends across the configured regions and refreshes RADAR Global News, combines the leads, and tries to create source-backed coverage for every active news category, including sports and its subcategories. It targets daily coverage: categories already receiving a published story today are skipped. It may create up to two drafts and publish at most one eligible story per run. Automatic publication requires at least two distinct publishers with full extracted articles, editorial quality checks, duplicate checks, and a genuinely verified 4K featured image (3840×2160 landscape or 2160×3840 portrait). No featured image or no verified 4K image means no publication. Available publisher video is attached with its source; video is optional. Sensitive high-impact political, legal, medical, violence and allegation reporting remains held for human review, and categories with no credible current source are skipped rather than filled with invented news. Every run and its category coverage are logged. Storage management also checks MongoDB usage every pass; above 60% it can remove only non-owner, low-engagement published stories older than 180 days and their unreferenced uploaded images, then aims for 55%. It never deletes owner-authored stories, owner-uploaded files, drafts, review-queue stories, breaking stories, scheduled stories, or stories with comments, likes or more than 25 views. It does not change user roles, approve writer applications or manage payouts. Global News desk: https://www.radartimes.2bd.net/mugishaimekevin/global-news
          </p>
          {autoManage.lastRunAt && <p className="mt-2 text-xs text-slate-500">Last run: {new Date(autoManage.lastRunAt).toLocaleString()} · {autoManage.lastResult?.drafted || 0} articles created · {autoManage.lastResult?.published || 0} published · {autoManage.lastResult?.held || 0} held · {autoManage.lastResult?.verified4kImages || 0} verified 4K images · {autoManage.lastResult?.videosAttached || 0} videos attached · {autoManage.lastResult?.trendResearch?.topics || 0} Google Trends topics · {autoManage.lastResult?.categoriesAttempted || 0} categories checked this pass · {autoManage.lastResult?.categoriesAlreadyCovered || 0}/{autoManage.lastResult?.categoriesChecked || 0} categories already covered today.</p>}
          {autoManage.lastResult?.notes?.length ? (
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              {autoManage.lastResult.notes.slice(0, 5).map((item, index) => <li key={item.id || item.topic || index}><span className="font-medium">{item.title || item.topic || item.error}</span>{item.outcome && <span className="ml-2 uppercase text-[10px] text-slate-500">{item.outcome}</span>}{item.reason && <span className="ml-2 text-slate-500">— {item.reason}</span>}</li>)}
            </ul>
          ) : null}
        </section>
      )}

      <TrendRadar onUse={status?.configured ? chooseTrend : undefined} />

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
                label={trend ? 'Trending topic from Google' : 'Topic'}
                hint={trend
                  ? `Google reported"${trend.topic}" trending in ${trend.geo} and the server fetched it, so this story is written from a real search.`
                  : 'Or pick one from the trending list above and it writes from what Google actually reported.'}
                fieldRef={topicField}
                value={topic}
                onChange={(value) => {
                  setTopic(value)
                  if (trend && value !== trend.topic) setTrend(null)
                }}
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
              <Sparkles className="h-4 w-4" />
              {generating ? 'Gemini is writing…' : trend ? 'Write this trending story' : 'Write the story'}
            </button>
            {generating && (
              <p className="mt-2 text-xs text-slate-500">A report can take up to a minute. Keep this page open.</p>
            )}
          </section>

          <AiResearchChat onUseTopic={takeToWriter} />

          {draft && (
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-bold text-slate-900">{savedId ? 'Now live — check it reads well' : 'Read it before anyone does'}</h2>
              <p className="mt-1 text-xs text-slate-500">
                {savedId
                  ? 'Auto mode published this story as soon as Gemini finished. Open it in the editor to fix anything.'
                  : 'Nothing reaches a reader until you save it. Check every fact and fix the wording.'}
              </p>
              {draft.evidence && (
                <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/70 px-4 py-3 text-xs text-blue-900">
                  <p className="font-bold">Written from one real search</p>
                  <p className="mt-1">
                    Google Trends, {draft.evidence.region}: “{draft.evidence.topic}”
                    {draft.evidence.trafficLabel && ` · ${draft.evidence.trafficLabel} searches`} · fetched{' '}
                    {new Date(draft.evidence.fetchedAt).toLocaleString()}
                  </p>
                  {draft.evidence.headlines.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {draft.evidence.headlines.map((item) => (
                        <li key={item.url}>
                          <a href={item.url} target="_blank" rel="noreferrer nofollow" className="underline decoration-blue-300">
                            {item.title || item.url}
                          </a>
                          <span className="text-blue-700/70"> — {item.source}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-blue-800/80">
                    Gemini saw these as background only and was told not to copy them. Check them before you publish.
                  </p>
                </div>
              )}

              {draft.photo?.url && (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-bold text-slate-700">The picture the source published</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <img src={draft.photo.url} alt="" className="h-20 w-32 rounded-md border border-slate-200 bg-white object-cover" />
                    <p className="min-w-0 flex-1 text-xs text-slate-600">
                      {draft.photo.source ? `Credited to ${draft.photo.source}.` : 'No publisher was named for this picture.'}{' '}
                      {draft.photo.articleUrl && (
                        <a href={draft.photo.articleUrl} target="_blank" rel="noreferrer nofollow" className="font-semibold text-blue-700 underline">
                          Open the source
                        </a>
                      )}
                    </p>
                  </div>
                  <label className="mt-3 flex items-start gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={image === (draft.photo?.url || '') && Boolean(image)}
                      onChange={(event) => {
                        setImage(event.target.checked ? draft.photo?.url || '' : '')
                        setImageCredit(event.target.checked ? draft.photo?.source || '' : '')
                        setImageSourceUrl(event.target.checked ? draft.photo?.articleUrl || '' : '')
                      }}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300"
                    />
                    Use this picture and print the credit under it. Leave it off to attach one of your own in the editor.
                  </label>
                </div>
              )}

              {/* A machine wrote the story, so the picture underneath it has to be
                  one a person chose and whose owner is named. */}
              <div className="mt-4">
                <AiPhotoPicker
                  topic={topic || title}
                  attached={image ? { url: image, credit: imageCredit, sourceUrl: imageSourceUrl } : null}
                  onAttach={(photo) => {
                    setImage(photo.url)
                    setImageCredit(photo.credit)
                    setImageSourceUrl(photo.sourceUrl)
                    setError('')
                  }}
                  onDetach={() => {
                    setImage('')
                    setImageCredit('')
                    setImageSourceUrl('')
                  }}
                />
              </div>

              <div className="mt-4 space-y-4">
                <Field id="aiTitle" label="Headline" hint="Also used as the search-result title." value={title} onChange={setTitle} counter={90} />
                <Field
                  id="aiMeta"
                  label="Meta description"
                  hint="What a search engine prints under the link. Keep it under 155 characters and do not repeat the headline."
                  value={meta}
                  onChange={setMeta}
                  counter={155}
                />
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
                    <option value="">Choose where this story goes</option>
                    {grouped.map(([group, options]) => (
                      <optgroup key={group} label={group}>
                        {options.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <p className="mt-1.5 text-xs text-slate-500">
                    A sub-section is its own address — Football opens /sports/football and still reads on /sports.
                  </p>
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
                    <Sparkles className="h-4 w-4" />
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
                <h2 className="font-bold text-slate-900">Manual AI writer auto-publish</h2>
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

      <AiReviewQueue reloadKey={queueKey} />
    </div>
  )
}
