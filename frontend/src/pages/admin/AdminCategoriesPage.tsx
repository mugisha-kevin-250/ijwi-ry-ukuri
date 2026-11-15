import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Eye,
  EyeOff,
  ExternalLink,
  FolderTree,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import type { AdminSectionRecord, SectionDraft } from '../../services/api'
import { adminAPI } from '../../services/api'
import { serverMessage } from '../../services/apiClient'
import { cn } from '../../utils/cn'

/**
 * The section desk.
 *
 * A section is where a story lives, so this screen is built around the two
 * things an admin cannot see from a name: how many stories are filed here, and
 * whether the web address is one readers, search engines and the sitemap
 * already know. Renaming is safe. Moving and removing are not, and this screen
 * says so before it lets anyone click.
 */

const BLANK: SectionDraft = { name: '', slug: '', description: '', parent: null, order: 0, aliases: [], isActive: true }

const input =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100'

function slugify(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120)
}

export default function AdminCategoriesPage() {
  const [sections, setSections] = useState<AdminSectionRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  // null = nothing open, 'new' = creating, anything else = the id being edited.
  const [openId, setOpenId] = useState<string | null>(null)
  const [draft, setDraft] = useState<SectionDraft>(BLANK)
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      setSections(await adminAPI.getSections())
    } catch (err) {
      setError(serverMessage(err, 'We could not read the sections. Check your connection and try again.'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const topLevel = useMemo(() => sections.filter((item) => !item.parent), [sections])
  const editing = openId && openId !== 'new' ? sections.find((item) => item._id === openId) || null : null

  const open = (section: AdminSectionRecord) => {
    setNotice('')
    setError('')
    setOpenId(section._id)
    setDraft({
      name: section.name,
      slug: section.slug,
      description: section.description,
      parent: section.parent,
      order: section.order,
      aliases: section.aliases,
      isActive: section.isActive,
    })
  }

  const startNew = () => {
    setNotice('')
    setError('')
    setOpenId('new')
    setDraft({ ...BLANK, order: (topLevel.length + 1) * 10 })
  }

  const close = () => {
    setOpenId(null)
    setDraft(BLANK)
  }

  const save = async () => {
    if (!draft.name.trim()) {
      setError('A section needs a name.')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (openId === 'new') {
        const response = await adminAPI.createSection(draft)
        const made = response.data.data?.category
        setNotice(`“${made?.name || draft.name}” is filed. It appears in the header as soon as the site reloads the section list.`)
      } else if (openId) {
        await adminAPI.updateSection(openId, draft)
        setNotice('Section saved.')
      }
      close()
      await load()
    } catch (err) {
      setError(serverMessage(err, 'That section could not be saved.'))
    } finally {
      setBusy(false)
    }
  }

  /**
   * Hide, rather than lose.
   *
   * The ordinary way to take a section off the page. The stories keep their
   * home and their address; the section simply stops being offered.
   */
  const toggleActive = async (section: AdminSectionRecord) => {
    setSavingId(section._id)
    setError('')
    setNotice('')
    try {
      // Everything else is sent back exactly as it was read, so hiding a section
      // cannot accidentally re-derive its address from its name.
      await adminAPI.updateSection(section._id, {
        name: section.name,
        slug: section.slug,
        description: section.description,
        parent: section.parent,
        order: section.order,
        aliases: section.aliases,
        isActive: !section.isActive,
      })
      await load()
      setNotice(section.isActive ? `“${section.name}” is hidden from readers.` : `“${section.name}” is back in the navigation.`)
    } catch (err) {
      setError(serverMessage(err, 'That change could not be saved.'))
    } finally {
      setSavingId(null)
    }
  }

  const remove = async (section: AdminSectionRecord) => {
    const into = window.prompt(
      section.storyCount
        ? `“${section.name}” has ${section.storyCount} stor${section.storyCount === 1 ? 'y' : 'ies'} filed under it.\n\nType the exact name of the section they should move to, and it will be deleted. Leave it empty only to change your mind.`
        : `Delete “${section.name}”? Nothing is filed under it, so no story is affected.`,
      section.storyCount ? '' : section.name,
    )
    if (into === null) return
    if (section.storyCount && !into.trim()) return

    setSavingId(section._id)
    setError('')
    setNotice('')
    try {
      const moveTo = section.storyCount
        ? sections.find((item) => item.name.toLowerCase() === into.trim().toLowerCase() && item._id !== section._id)?._id
        : undefined
      if (section.storyCount && !moveTo) {
        setError(`There is no section called “${into.trim()}”. Type the name exactly as it appears in the list.`)
        return
      }
      const response = await adminAPI.deleteSection(section._id, moveTo || null)
      const moved = (response.data.data as { moved?: number } | undefined)?.moved || 0
      setNotice(
        moved
          ? `“${section.name}” is gone and ${moved} stor${moved === 1 ? 'y' : 'ies'} moved to “${sections.find((item) => item._id === moveTo)?.name || 'the section you named'}”.`
          : `“${section.name}” is gone.`,
      )
      if (openId === section._id) close()
      await load()
    } catch (err) {
      setError(serverMessage(err, 'That section could not be removed.'))
    } finally {
      setSavingId(null)
    }
  }

  const ordered = useMemo(() => {
    const parents = sections.filter((item) => !item.parent)
    const kids = sections.filter((item) => item.parent)
    return [...parents, ...kids]
  }, [sections])

  // A sub-section is published under its parent's address, the same way the
  // header links it: /world/middle-east, not /middle-east.
  const hrefOf = (section: AdminSectionRecord) => {
    const parent = section.parent ? sections.find((item) => item._id === section.parent) : null
    return parent ? `/${parent.slug}/${section.slug}` : `/${section.slug}`
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-blue-700">Admin / Sections</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">Sections</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            The desks a story can be filed under, the names in the header and the addresses a reader can bookmark.
            A section that holds stories is never deleted out from under them: it is hidden, or its stories are moved first.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} disabled={isLoading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />Refresh
          </button>
          <button type="button" onClick={startNew} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700">
            <Plus className="h-4 w-4" />New section
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

      {openId && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 className="font-bold text-slate-900">{openId === 'new' ? 'A new section' : `Editing “${editing?.name}”`}</h2>
            <button type="button" onClick={close} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-600">
              <span className="mb-1 block">Name readers see</span>
              <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={input} placeholder="Business" />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              <span className="mb-1 block">Web address</span>
              <input
                value={draft.slug ?? ''}
                // A published address is fixed: the name can change without
                // breaking the link a reader already has.
                disabled={Boolean(editing?.inSectionTree)}
                onChange={(event) => setDraft({ ...draft, slug: slugify(event.target.value) })}
                className={cn(input, editing?.inSectionTree && 'cursor-not-allowed bg-slate-50 text-slate-400')}
                placeholder={slugify(draft.name) || 'business'}
              />
              {editing?.inSectionTree && (
                <span className="mt-1 block text-[11px] font-normal text-slate-500">
                  This address is published in the header and the sitemap, so it stays where it is. Change the name above instead.
                </span>
              )}
            </label>
            <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
              <span className="mb-1 block">Description shown on the section page</span>
              <textarea value={draft.description ?? ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={2} className={input} placeholder="Companies, money, trade and work." />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              <span className="mb-1 block">Sits under</span>
              <select
                value={draft.parent ?? ''}
                onChange={(event) => setDraft({ ...draft, parent: event.target.value || null })}
                className={input}
              >
                <option value="">Top level — it gets its own place in the header</option>
                {topLevel
                  .filter((item) => item._id !== openId)
                  .map((item) => (
                    <option key={item._id} value={item._id}>{item.name}</option>
                  ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              <span className="mb-1 block">Order in the header</span>
              <input type="number" value={draft.order ?? 0} onChange={(event) => setDraft({ ...draft, order: Number(event.target.value) })} className={input} />
            </label>
            <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
              <span className="mb-1 block">Other spellings the same section is stored under</span>
              <input
                value={(draft.aliases ?? []).join(', ')}
                onChange={(event) => setDraft({ ...draft, aliases: event.target.value.split(',').map(slugify).filter(Boolean) })}
                className={input}
                placeholder="ubucuruzi, economy"
              />
              <span className="mt-1 block text-[11px] font-normal text-slate-500">
                A story tagged with one of these is served by this section too, so the old spelling keeps working.
              </span>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={draft.isActive !== false} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} className="h-4 w-4 rounded border-slate-300" />
              Show it to readers
            </label>
            <button type="button" onClick={() => void save()} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {openId === 'new' ? 'Create section' : 'Save section'}
            </button>
          </div>
        </section>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="space-y-3 p-5">{[1, 2, 3, 4].map((item) => <div key={item} className="h-16 animate-pulse rounded-lg bg-slate-100" />)}</div>
        ) : ordered.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <FolderTree className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">There are no sections yet. A story cannot be filed until there is one.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {ordered.map((section) => (
              <li key={section._id} className={cn('px-5 py-4', section.parent && 'bg-slate-50/60')}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                      {section.parent && <span className="text-xs font-bold text-slate-400">└</span>}
                      {section.name}
                      {!section.isActive && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">hidden</span>
                      )}
                      {section.inSectionTree && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700">published address</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      <code className="rounded bg-slate-100 px-1.5 py-0.5">/{section.slug}</code>
                      {' · '}
                      {section.storyCount} stor{section.storyCount === 1 ? 'y' : 'ies'} filed
                      {section.parentName ? ` · under ${section.parentName}` : ''}
                      {section.aliases.length ? ` · also spelled ${section.aliases.join(', ')}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={hrefOf(section)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700">
                      <ExternalLink className="h-3.5 w-3.5" />View
                    </a>
                    <button
                      type="button"
                      disabled={savingId === section._id}
                      onClick={() => void toggleActive(section)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-200 disabled:opacity-60"
                    >
                      {section.isActive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      {section.isActive ? 'Hide' : 'Show'}
                    </button>
                    <button
                      type="button"
                      disabled={savingId === section._id}
                      onClick={() => open(section)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-100 disabled:opacity-60"
                    >
                      <Save className="h-3.5 w-3.5" />Edit
                    </button>
                    <button
                      type="button"
                      disabled={savingId === section._id}
                      onClick={() => void remove(section)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                    >
                      <Trash2 className="h-3.5 w-3.5" />Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
