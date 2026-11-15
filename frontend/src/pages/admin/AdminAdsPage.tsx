import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Ban,
  Check,
  Megaphone,
  MousePointerClick,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import AdCreative from '../../components/ads/AdCreative'
import { SHAPE_BY_PLACEMENT } from '../../components/ads/AdSlot'
import type { Shape } from '../../components/ads/AdvertiseWithUs'
import type { AdBrief, AdDraft, AdPlacementName, AdminAdRecord } from '../../services/api'
import { adminAPI } from '../../services/api'
import { serverMessage } from '../../services/apiClient'
import type { AdCampaign } from '../../utils/adsStore'
import { cn } from '../../utils/cn'

/**
 * The advertising desk.
 *
 * This is where a space on the site gets sold. An admin says who is paying and
 * what they are offering; Gemini can turn that brief into the wording and the
 * colours; and nothing a reader sees until someone in this room presses publish.
 * That order is the whole design of the screen - the generate button does not
 * save, and the save button does not publish.
 *
 * The preview is not decoration. It is the same component that renders the
 * campaign on the public page, in the shape of the space it was sold into, so
 * what an admin approves here is what goes out there.
 */

const BLANK: AdDraft = {
  advertiser: '',
  headline: '',
  body: '',
  ctaLabel: '',
  link: '',
  image: '',
  placements: ['nav'],
  theme: { bg: '', fg: '', accent: '' },
  status: 'draft',
  startsAt: null,
  endsAt: null,
  priority: 0,
  note: '',
}

const BLANK_BRIEF: AdBrief = { advertiser: '', offer: '', link: '', placement: 'nav', tone: '', mustInclude: '' }

const input =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400'

/** Every space an ad can be sold into, in the words an admin would use. */
const PLACES: { name: AdPlacementName; label: string; where: string }[] = [
  { name: 'nav', label: 'Above the section links', where: 'one line, every public page' },
  { name: 'list', label: 'In a story list', where: 'the banner block on section pages' },
  { name: 'articleInline', label: 'Inside a story', where: 'between paragraphs' },
  { name: 'articleSidebar', label: 'Beside a story', where: 'desktop right column' },
  { name: 'newsRail', label: 'On the News page rail', where: 'right of the top stories' },
  { name: 'any', label: 'Every space at once', where: 'takes the whole site' },
]

const STATUS_STYLE: Record<string, string> = {
  live: 'bg-emerald-50 text-emerald-700',
  draft: 'bg-slate-100 text-slate-600',
  paused: 'bg-amber-50 text-amber-700',
}

function pretty(name: AdPlacementName): string {
  return PLACES.find((place) => place.name === name)?.label || name
}

/** A datetime-local box wants the local wall clock, not a UTC string. */
function fromIso(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function toIso(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function on(value: string | null | undefined): boolean {
  if (!value) return true
  return new Date(value).getTime() <= Date.now()
}

export default function AdminAdsPage() {
  const [ads, setAds] = useState<AdminAdRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)

  // null = closed, 'new' = a campaign that does not exist yet, otherwise the id.
  const [openId, setOpenId] = useState<string | null>(null)
  const [draft, setDraft] = useState<AdDraft>(BLANK)
  const [brief, setBrief] = useState<AdBrief>(BLANK_BRIEF)
  const [showBrief, setShowBrief] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      setAds(await adminAPI.getAds())
    } catch (err) {
      setError(serverMessage(err, 'We could not read the advertising desk. Check your connection and try again.'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const editing = openId && openId !== 'new' ? ads.find((item) => item._id === openId) || null : null

  /** Which spaces the form currently has ticked, in the order the site checks them. */
  const chosen: AdPlacementName[] = useMemo(() => {
    const list = Array.isArray(draft.placements) ? draft.placements : []
    return list.length ? list : ['nav']
  }, [draft.placements])

  const soldEverything = chosen.includes('any')
  const previewPlaces: AdPlacementName[] = soldEverything
    ? ['nav', 'articleInline', 'articleSidebar']
    : chosen.filter((name) => name !== 'any')

  const previewCampaign: AdCampaign | null = useMemo(() => {
    if (!openId) return null
    const headline = String(draft.headline || '').trim()
    const advertiser = String(draft.advertiser || '').trim()
    if (!headline) return null
    return {
      id: openId === 'new' ? 'preview' : openId,
      advertiser,
      headline,
      body: String(draft.body || '').trim(),
      ctaLabel: String(draft.ctaLabel || '').trim() || 'Learn more',
      link: String(draft.link || '').trim() || window.location.href,
      image: String(draft.image || '').trim(),
      theme: {
        bg: String(draft.theme?.bg || '').trim(),
        fg: String(draft.theme?.fg || '').trim(),
        accent: String(draft.theme?.accent || '').trim(),
      },
    }
  }, [openId, draft])

  const startNew = () => {
    setError('')
    setNotice('')
    setOpenId('new')
    setDraft({ ...BLANK })
    setBrief({ ...BLANK_BRIEF })
    setShowBrief(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const open = (ad: AdminAdRecord) => {
    setError('')
    setNotice('')
    setShowBrief(false)
    setOpenId(ad._id)
    setDraft({
      advertiser: ad.advertiser,
      headline: ad.headline,
      body: ad.body,
      ctaLabel: ad.ctaLabel,
      link: ad.link,
      image: ad.image,
      placements: ad.placements,
      theme: { ...ad.theme },
      status: ad.status,
      startsAt: ad.startsAt,
      endsAt: ad.endsAt,
      priority: ad.priority,
      note: ad.note,
      // Carried through untouched: an edit of a machine-drafted creative is still
      // a machine-drafted creative, and the desk needs to be able to see that.
      source: ad.source,
      model: ad.model,
      brief: ad.brief,
    })
  }

  const close = () => {
    setOpenId(null)
    setDraft(BLANK)
    setShowBrief(false)
  }

  /**
   * Ask Gemini to design the creative.
   *
   * The answer lands in the form below and nowhere else. The server does not save
   * it either, so pressing this four times costs four model calls and leaves zero
   * campaigns behind until somebody decides one of them is worth running.
   */
  const generate = async () => {
    if (!brief.advertiser.trim()) {
      setError('Tell Gemini who the advertisement is from.')
      return
    }
    if (brief.offer.trim().length < 12) {
      setError('Write the brief - what the advertiser is actually offering. One sentence is enough.')
      return
    }
    setGenerating(true)
    setError('')
    setNotice('')
    try {
      const designed = await adminAPI.generateAd(brief)
      setDraft((current) => ({
        ...current,
        ...designed,
        startsAt: current.startsAt ?? null,
        endsAt: current.endsAt ?? null,
        priority: current.priority ?? 0,
        note: current.note ?? '',
        theme: { ...designed.theme },
      }))
      setShowBrief(false)
      setNotice(
        designed.model
          ? `Gemini wrote this creative with ${designed.model}. Nothing is on the site yet — read it, change it, then save it.`
          : 'Gemini wrote this creative. Nothing is on the site yet — read it, change it, then save it.',
      )
    } catch (err) {
      setError(serverMessage(err, 'Gemini could not write that creative. You can still write it by hand below.'))
    } finally {
      setGenerating(false)
    }
  }

  /** Save what is in the form. `status` is where it goes: draft, live or paused. */
  const save = async (status: 'draft' | 'live' | 'paused') => {
    if (!String(draft.advertiser || '').trim()) {
      setError('Say who the advertisement is from.')
      return
    }
    if (!String(draft.headline || '').trim()) {
      setError('The creative needs a headline.')
      return
    }
    if (!String(draft.link || '').trim()) {
      setError('Give the ad the link a reader goes to when they tap it.')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const payload: AdDraft = { ...draft, status }
      const saved =
        openId === 'new'
          ? (await adminAPI.createAd(payload)).data.data?.ad
          : (await adminAPI.updateAd(openId || '', payload)).data.data?.ad
      const name = saved?.advertiser || draft.advertiser
      setNotice(
        status === 'live'
          ? `“${name}” is published. It is in ${soldEverything ? 'every space on the site' : pretty(chosen[0])} as soon as a page reloads.`
          : status === 'paused'
            ? `“${name}” is paused and off the pages, with its clicks kept.`
            : `“${name}” is saved as a draft. Nobody sees it until you publish it.`,
      )
      close()
      await load()
    } catch (err) {
      setError(serverMessage(err, 'That campaign could not be saved.'))
    } finally {
      setBusy(false)
    }
  }

  /** One-field patch, so pressing publish never rewrites the creative. */
  const setStatus = async (ad: AdminAdRecord, status: 'draft' | 'live' | 'paused') => {
    setSavingId(ad._id)
    setError('')
    setNotice('')
    try {
      await adminAPI.updateAd(ad._id, { status })
      await load()
      setNotice(
        status === 'live'
          ? `“${ad.advertiser}” is on the pages${ad.endsAt && !on(ad.endsAt) ? ' — note that its booked window has already ended, so it will come back off again' : ''}.`
          : status === 'paused'
            ? `“${ad.advertiser}” is paused and off the pages.`
            : `“${ad.advertiser}” is a draft again.`,
      )
    } catch (err) {
      setError(serverMessage(err, 'That change could not be made.'))
    } finally {
      setSavingId(null)
    }
  }

  const remove = async (ad: AdminAdRecord) => {
    if (ad.status === 'live') {
      setError(`“${ad.advertiser}” is running. Pause it first — an ad that vanishes while someone is paying for it looks like the site hid it.`)
      return
    }
    if (!window.confirm(`Delete “${ad.advertiser}” and its ${ad.clicks} click${ad.clicks === 1 ? '' : 's'}? This cannot be undone.`)) return
    setSavingId(ad._id)
    setError('')
    setNotice('')
    try {
      await adminAPI.deleteAd(ad._id)
      if (openId === ad._id) close()
      await load()
      setNotice(`“${ad.advertiser}” is deleted.`)
    } catch (err) {
      setError(serverMessage(err, 'That campaign could not be removed.'))
    } finally {
      setSavingId(null)
    }
  }

  const togglePlace = (name: AdPlacementName) => {
    const current = chosen
    if (name === 'any') {
      setDraft({ ...draft, placements: current.includes('any') ? ['nav'] : ['any'] })
      return
    }
    const next = current.includes(name) ? current.filter((item) => item !== name) : [...current.filter((item) => item !== 'any'), name]
    setDraft({ ...draft, placements: next.length ? next : ['nav'] })
  }

  const running = ads.filter((ad) => ad.isRunning).length
  const needsReading = ads.filter((ad) => ad.source === 'ai' && ad.status !== 'live').length

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-blue-700">Admin / Advertising</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">Advertising desk</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            The newsroom sells these spaces itself. Write the brief, let Gemini design the creative or write it by hand,
            and publish the one you would be comfortable seeing your own readers tap. A generated creative is stored as a
            draft marked as machine-written until a person publishes it.
          </p>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-500">
            <span>{ads.length} campaign{ads.length === 1 ? '' : 's'}</span>
            <span className="text-emerald-700">{running} on the pages now</span>
            {needsReading > 0 && <span className="text-amber-700">{needsReading} AI draft{needsReading === 1 ? '' : 's'} waiting to be read</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            Refresh
          </button>
          <button
            type="button"
            onClick={startNew}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            New campaign
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && !error && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      )}

      {openId && showBrief && (
        <section className="rounded-xl border border-violet-200 bg-violet-50/50 p-5 shadow-sm">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-bold text-slate-900">
                <Sparkles className="h-4 w-4 text-violet-600" />
                Let Gemini design the creative
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Say who it is from and what they are offering. The model writes wording and picks colours; it is told not
                to invent a price, a date, a statistic or a claim. What comes back goes into the form below, unsaved.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowBrief(false)}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white hover:text-slate-700"
              aria-label="Skip Gemini"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-600">
              <span className="mb-1 block">Advertiser</span>
              <input
                value={brief.advertiser}
                onChange={(event) => setBrief({ ...brief, advertiser: event.target.value })}
                className={input}
                placeholder="Kigali Heights Supermarket"
                maxLength={80}
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              <span className="mb-1 block">Run it in</span>
              <select
                value={brief.placement || 'nav'}
                onChange={(event) => setBrief({ ...brief, placement: event.target.value as AdPlacementName })}
                className={input}
              >
                {PLACES.map((place) => (
                  <option key={place.name} value={place.name}>
                    {place.label} — {place.where}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
              <span className="mb-1 block">What they are offering</span>
              <textarea
                value={brief.offer}
                onChange={(event) => setBrief({ ...brief, offer: event.target.value })}
                rows={3}
                className={input}
                placeholder="Weekly groceries, own bakery, delivery in Kigali on the same day, open until 10pm every day including Sunday."
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              <span className="mb-1 block">Link the tap opens</span>
              <input
                value={brief.link || ''}
                onChange={(event) => setBrief({ ...brief, link: event.target.value })}
                className={input}
                placeholder="https://kigaliheights.rw"
              />
              <span className="mt-1 block text-[11px] font-normal text-slate-500">
                Public https only. You can fill this in after generating — the ad cannot be saved without it.
              </span>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              <span className="mb-1 block">Tone</span>
              <input
                value={brief.tone || ''}
                onChange={(event) => setBrief({ ...brief, tone: event.target.value })}
                className={input}
                placeholder="plain, factual, no shouting"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
              <span className="mb-1 block">Must be said exactly</span>
              <input
                value={brief.mustInclude || ''}
                onChange={(event) => setBrief({ ...brief, mustInclude: event.target.value })}
                className={input}
                placeholder="Karura branch · 0788 000 000"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">Or close this and write the whole thing yourself.</p>
            <button
              type="button"
              onClick={() => void generate()}
              disabled={generating}
              className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-60"
            >
              {generating ? <Sparkles className="h-4 w-4 animate-pulse" /> : <Sparkles className="h-4 w-4" />}
              {generating ? 'Gemini is writing' : 'Design it'}
            </button>
          </div>
        </section>
      )}

      {openId && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-900">
                {openId === 'new' ? 'A new campaign' : `Editing “${editing?.advertiser}”`}
              </h2>
              {draft.source === 'ai' && (
                <p className="mt-1 text-xs text-violet-700">
                  Written by {draft.model || 'Gemini'}
                  {draft.brief ? ` from the brief “${draft.brief.slice(0, 120)}${draft.brief.length > 120 ? '…' : ''}”` : ''}
                  {' · '}read it before you publish it.
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {openId === 'new' || !showBrief ? (
                <button
                  type="button"
                  onClick={() => setShowBrief((current) => !current)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 py-2 text-xs font-bold text-violet-700 transition hover:bg-violet-100"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {showBrief ? 'Hide Gemini' : 'Ask Gemini again'}
                </button>
              ) : null}
              <button
                type="button"
                onClick={close}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-600">
              <span className="mb-1 block">Who is paying for this</span>
              <input
                value={draft.advertiser || ''}
                onChange={(event) => setDraft({ ...draft, advertiser: event.target.value })}
                className={input}
                maxLength={80}
                placeholder="Kigali Heights Supermarket"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              <span className="mb-1 block">The link a reader goes to</span>
              <input
                value={draft.link || ''}
                onChange={(event) => setDraft({ ...draft, link: event.target.value })}
                className={input}
                maxLength={500}
                placeholder="https://kigaliheights.rw"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
              <span className="mb-1 block">Headline</span>
              <input
                value={draft.headline || ''}
                onChange={(event) => setDraft({ ...draft, headline: event.target.value })}
                className={input}
                maxLength={120}
                placeholder="Fresh bread every morning in Karura"
              />
              <span className="mt-1 block text-[11px] font-normal text-slate-500">
                {String(draft.headline || '').length}/120 — in the strip above the section links this is the only line a
                reader sees, so it has to carry the offer on its own.
              </span>
            </label>
            <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
              <span className="mb-1 block">Second line, shown where there is room</span>
              <textarea
                value={draft.body || ''}
                onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                rows={2}
                maxLength={320}
                className={input}
                placeholder="Groceries, bakery and same-day delivery in Kigali. Open until 10pm, every day."
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              <span className="mb-1 block">Button says</span>
              <input
                value={draft.ctaLabel || ''}
                onChange={(event) => setDraft({ ...draft, ctaLabel: event.target.value })}
                className={input}
                maxLength={30}
                placeholder="See the menu"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              <span className="mb-1 block">Optional artwork</span>
              <input
                value={draft.image || ''}
                onChange={(event) => setDraft({ ...draft, image: event.target.value })}
                className={input}
                maxLength={500}
                placeholder="/uploads/… or https://…"
              />
              <span className="mt-1 block text-[11px] font-normal text-slate-500">
                Paste an address. The smaller the space, the less of the picture a reader gets — the strip shows 44 pixels.
              </span>
            </label>

            <div className="text-xs font-semibold text-slate-600 sm:col-span-2">
              <span className="mb-1 block">Sold into</span>
              <div className="flex flex-wrap gap-2">
                {PLACES.map((place) => {
                  const isOn = place.name === 'any' ? soldEverything : chosen.includes(place.name) && !soldEverything
                  return (
                    <button
                      key={place.name}
                      type="button"
                      onClick={() => togglePlace(place.name)}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-left text-xs font-semibold transition',
                        isOn
                          ? 'border-blue-300 bg-blue-50 text-blue-800'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        {isOn ? <Check className="h-3.5 w-3.5" /> : null}
                        {place.label}
                      </span>
                      <span className="mt-0.5 block text-[11px] font-normal text-slate-500">{place.where}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="text-xs font-semibold text-slate-600 sm:col-span-2">
              <span className="mb-1 block">Their colours</span>
              <div className="grid gap-3 sm:grid-cols-3">
                {([
                  ['bg', 'Background'],
                  ['fg', 'Text'],
                  ['accent', 'Button and highlights'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <input
                      type="color"
                      value={/^#[0-9a-f]{6}$/i.test(String(draft.theme?.[key] || '')) ? String(draft.theme?.[key]) : '#0a1f4d'}
                      onChange={(event) => setDraft({ ...draft, theme: { ...draft.theme, [key]: event.target.value } })}
                      className="h-7 w-9 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                      aria-label={label}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-slate-700">{label}</span>
                      <span className="block font-mono text-[11px] text-slate-500">{String(draft.theme?.[key] || '') || 'site default'}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, theme: { ...draft.theme, [key]: '' } })}
                      className="ml-auto rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      aria-label={`Reset ${label}`}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  </label>
                ))}
              </div>
              <span className="mt-1 block text-[11px] font-normal text-slate-500">
                Blank is fine: the text colour is then chosen from the background so the creative stays readable, and the
                button falls back to the text colour.
              </span>
            </div>

            <label className="text-xs font-semibold text-slate-600">
              <span className="mb-1 block">Runs from</span>
              <input
                type="datetime-local"
                value={fromIso(draft.startsAt || null)}
                onChange={(event) => setDraft({ ...draft, startsAt: toIso(event.target.value) })}
                className={input}
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              <span className="mb-1 block">Comes off on its own at</span>
              <input
                type="datetime-local"
                value={fromIso(draft.endsAt || null)}
                onChange={(event) => setDraft({ ...draft, endsAt: toIso(event.target.value) })}
                className={input}
              />
              <span className="mt-1 block text-[11px] font-normal text-slate-500">
                Leave both blank for an open booking. An expired campaign is taken off the pages without anyone pressing
                a button.
              </span>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              <span className="mb-1 block">Priority if two ads want the same space</span>
              <input
                type="number"
                value={draft.priority ?? 0}
                min={-100}
                max={100}
                onChange={(event) => setDraft({ ...draft, priority: Number(event.target.value) || 0 })}
                className={input}
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              <span className="mb-1 block">Note for the desk</span>
              <input
                value={draft.note || ''}
                onChange={(event) => setDraft({ ...draft, note: event.target.value })}
                className={input}
                maxLength={400}
                placeholder="Who sold it, what they agreed, when to chase the invoice"
              />
            </label>
          </div>

          {previewCampaign && (
            <div className="mt-5 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Exactly as it will appear</p>
              {previewPlaces.length ? (
                previewPlaces.map((name) => (
                  <div key={name} className="space-y-1">
                    <p className="text-[11px] font-semibold text-slate-500">{pretty(name)}</p>
                    <AdCreative
                      campaign={previewCampaign}
                      shape={(SHAPE_BY_PLACEMENT[name] || 'banner') as Shape}
                      className="pointer-events-none"
                    />
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">Pick at least one space to see it.</p>
              )}
              <p className="text-[11px] text-slate-500">
                The preview is not clickable, so an admin cannot accidentally send themselves to an advertiser while
                checking a creative.
              </p>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void save('draft')}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              Save as draft
            </button>
            <button
              type="button"
              onClick={() => void save('live')}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
            >
              <Upload className="h-4 w-4" />
              {editing?.status === 'live' ? 'Save and keep it running' : 'Publish it'}
            </button>
            {editing?.status === 'live' && (
              <button
                type="button"
                onClick={() => void setStatus(editing, 'paused')}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-50 px-3.5 py-2 text-sm font-bold text-amber-800 transition hover:bg-amber-100 disabled:opacity-60"
              >
                <Ban className="h-4 w-4" />
                Pause instead
              </button>
            )}
            {draft.source === 'ai' && (
              <button
                type="button"
                onClick={() => setDraft({ ...draft, source: 'desk', model: '' })}
                disabled={busy}
                className="ml-auto text-xs font-semibold text-slate-500 underline-offset-4 hover:underline"
              >
                I rewrote this — stop marking it as Gemini&apos;s
              </button>
            )}
          </div>
        </section>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="space-y-3 p-5">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-20 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : ads.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Megaphone className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">
              Nothing is sold yet. Every advertising space on the site is currently showing our own offer.
            </p>
            <button
              type="button"
              onClick={startNew}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Sell the first one
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {ads.map((ad) => {
              const over = ad.endsAt ? !on(ad.endsAt) : false
              const notYet = ad.startsAt ? new Date(ad.startsAt).getTime() > Date.now() : false
              return (
                <li key={ad._id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                        {ad.advertiser || 'Unnamed advertiser'}
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                            STATUS_STYLE[ad.status] || STATUS_STYLE.draft,
                          )}
                        >
                          {ad.isRunning ? 'on the pages' : ad.status}
                        </span>
                        {ad.source === 'ai' && (
                          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700">
                            Gemini
                          </span>
                        )}
                        {over && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            window ended
                          </span>
                        )}
                        {notYet && !over && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            not started
                          </span>
                        )}
                      </p>
                      <p className="mt-1 line-clamp-1 text-sm text-slate-700">{ad.headline}</p>
                      {ad.body && <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{ad.body}</p>}
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-600">
                          <MousePointerClick className="h-3.5 w-3.5" />
                          {ad.clicks} click{ad.clicks === 1 ? '' : 's'}
                        </span>
                        <span>{ad.placements.map(pretty).join(' · ')}</span>
                        <a href={ad.link} target="_blank" rel="noopener noreferrer" className="truncate underline-offset-2 hover:underline">
                          {ad.link}
                        </a>
                        {(ad.startsAt || ad.endsAt) && (
                          <span>
                            {ad.startsAt ? new Date(ad.startsAt).toLocaleDateString() : 'any time'} →{' '}
                            {ad.endsAt ? new Date(ad.endsAt).toLocaleDateString() : 'no end'}
                          </span>
                        )}
                        {ad.publishedAt && (
                          <span>
                            published {new Date(ad.publishedAt).toLocaleDateString()} by{' '}
                            {ad.publishedBy?.fullName || ad.publishedBy?.username || 'the desk'}
                          </span>
                        )}
                      </p>
                      {ad.note && <p className="mt-1 text-xs italic text-slate-400">{ad.note}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={savingId === ad._id || ad.status === 'live'}
                        onClick={() => void setStatus(ad, 'live')}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-40"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Publish
                      </button>
                      <button
                        type="button"
                        disabled={savingId === ad._id || ad.status !== 'live'}
                        onClick={() => void setStatus(ad, 'paused')}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs font-bold text-amber-800 transition hover:bg-amber-100 disabled:opacity-40"
                      >
                        <Ban className="h-3.5 w-3.5" />
                        Pause
                      </button>
                      <button
                        type="button"
                        disabled={savingId === ad._id}
                        onClick={() => open(ad)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-100 disabled:opacity-60"
                      >
                        <Save className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={savingId === ad._id || ad.status === 'live'}
                        onClick={() => void remove(ad)}
                        title={ad.status === 'live' ? 'Pause this campaign before deleting it' : undefined}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
