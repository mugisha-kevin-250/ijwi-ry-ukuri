import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  Clock,
  Headphones,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react'
import type { RadioEdition, RadioSlot, RadioTimetable } from '../../services/api'
import { adminAPI, publicAPI } from '../../services/api'
import type { Category } from '../../types'
import { serverMessage } from '../../services/apiClient'
import { cn } from '../../utils/cn'

/**
 * The timetable the radio follows.
 *
 * This is the admin telling the station when its programmes start and what each
 * one is made of. Everything downstream - which stories an edition carries, what
 * the voice says before the first one - is decided by these rows and nothing else,
 * so the panel shows what is actually on air under the times that were saved,
 * rather than leaving a person to hope the server read"18:00" the same way.
 */

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// A new row starts as a plain eight-story news programme with the model writing
// its intro, which is what every other row on the page already is.
function blankSlot(): RadioSlot {
  return { _id: `new-${Math.random().toString(36).slice(2, 9)}`, name: '', at: '12:00', days: [], storyCount: 8, categories: [], useAiScript: true, enabled: true }
}

const input =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100'

export default function RadioTimetablePanel() {
  const [timezone, setTimezone] = useState('Africa/Kigali')
  const [slots, setSlots] = useState<RadioSlot[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [onAir, setOnAir] = useState<RadioTimetable | null>(null)
  const [edition, setEdition] = useState<RadioEdition | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const [schedule, allCategories] = await Promise.all([
        adminAPI.getRadioSchedule(),
        publicAPI.getCategories().catch(() => null),
      ])
      setTimezone(schedule.timezone || 'Africa/Kigali')
      setSlots(schedule.slots || [])
      setOnAir(schedule.now || null)
      setEdition(schedule.now?.bulletin || null)
      setCategories((allCategories?.data?.data || []).filter((category) => category.isActive))
    } catch (cause) {
      setError(serverMessage(cause, 'The timetable could not be read.'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const patch = (id: string, change: Partial<RadioSlot>) =>
    setSlots((current) => current.map((slot) => (slot._id === id ? { ...slot, ...change } : slot)))

  const remove = (id: string) => setSlots((current) => current.filter((slot) => slot._id !== id))

  const toggleDay = (id: string, day: number) =>
    setSlots((current) =>
      current.map((slot) =>
        slot._id === id
          ? { ...slot, days: slot.days.includes(day) ? slot.days.filter((value) => value !== day) : [...slot.days, day].sort() }
          : slot,
      ),
    )

  const toggleCategory = (id: string, categoryId: string) =>
    setSlots((current) =>
      current.map((slot) =>
        slot._id === id
          ? {
              ...slot,
              categories: slot.categories.includes(categoryId)
                ? slot.categories.filter((value) => value !== categoryId)
                : [...slot.categories, categoryId],
            }
          : slot,
      ),
    )

  const save = async () => {
    setIsSaving(true)
    setError('')
    setSaved('')
    try {
      // The temporary ids the new rows were given locally mean nothing to the
      // database, so they are dropped and the list is read back with real ones.
      await adminAPI.saveRadioSchedule({
        timezone,
        slots: slots.map(({ name, at, days, storyCount, categories: picked, useAiScript, enabled }) => ({
          name,
          at,
          days,
          storyCount,
          categories: picked,
          useAiScript,
          enabled,
        })),
      })
      setSaved('Timetable saved. The next edition is built from it.')
      await load()
    } catch (cause) {
      setError(serverMessage(cause, 'The timetable could not be saved.'))
    } finally {
      setIsSaving(false)
    }
  }

  const rebuild = async () => {
    setIsRefreshing(true)
    setError('')
    setSaved('')
    try {
      const edition = await adminAPI.refreshRadioBulletin()
      // Read the timetable again rather than trusting the response alone, so what
      // the panel shows afterwards is the same thing a reader would be served.
      await load()
      setSaved(
        edition
          ? `Rebuilt"${edition.slotName}" with ${edition.storyTitles.length} ${edition.storyTitles.length === 1 ? 'story' : 'stories'}. Its intro came from ${edition.scriptSource === 'ai' ? edition.model || 'the model' : 'the desk'}.`
          : 'This edition was rebuilt from what is published right now.',
      )
    } catch (cause) {
      setError(serverMessage(cause, 'The edition could not be rebuilt.'))
    } finally {
      setIsRefreshing(false)
    }
  }

  const nextIn = useMemo(() => {
    if (!onAir?.next) return ''
    const ms = new Date(onAir.next.startsAt).getTime() - Date.now()
    if (!Number.isFinite(ms) || ms <= 0) return ''
    const hours = Math.floor(ms / 3_600_000)
    const minutes = Math.max(1, Math.round((ms % 3_600_000) / 60_000))
    return hours ? `${hours}h ${minutes}min` : `${minutes}min`
  }, [onAir])

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
          <Headphones className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-bold text-slate-900">Radio timetable</h2>
          <p className="text-xs text-slate-500">When the programmes start, what each one carries, and who writes the presenter&apos;s lines.</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-600">
        The radio plays the bulletin of whichever programme is on air at this minute, and the reader hears the stories this
        site has published in the day before it started. Nothing here publishes a story; it decides the order they are read in.
      </p>

      {isLoading && (
        <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
 Reading the timetable…
        </p>
      )}

      {!isLoading && (
        <>
          <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg bg-slate-50 px-4 py-3">
            <label className="text-xs font-semibold text-slate-600">
              <span className="mb-1 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Every time below is read on this clock
              </span>
              <input value={timezone} onChange={(event) => setTimezone(event.target.value)} className={cn(input, 'max-w-[220px]')} placeholder="Africa/Kigali" />
            </label>
            <div className="min-w-0 flex-1 text-xs text-slate-600">
              {onAir?.current ? (
                <p>
                  <span className="font-bold text-emerald-700">On air now:</span> {onAir.current.name}, started {onAir.current.at}.{' '}
                  {onAir.next && nextIn ? <>Next: <span className="font-semibold">{onAir.next.name}</span> in about {nextIn}.</> : null}
                </p>
              ) : (
                <p>Nothing is scheduled, so the radio page has no bulletin to offer.</p>
              )}
              {edition && (
                <p className="mt-1">
                  This edition carries {edition.stories.length} stor{edition.stories.length === 1 ? 'y' : 'ies'}. Its intro was written by{' '}
                  <span className="font-semibold">{edition.scriptSource === 'ai' ? `${edition.model || 'the model'}` : 'the desk'}</span>
                  {edition.scriptSource === 'ai' ? ' — not checked by a person before it was read out.' : '.'}
                </p>
              )}
              {edition?.opening && (
                <blockquote className="mt-2 border-l-2 border-emerald-300 pl-3 text-sm italic text-slate-700">
                  &ldquo;{edition.opening}&rdquo;
                </blockquote>
              )}
              {edition && edition.stories.length > 0 && (
                <ol className="mt-2 list-decimal space-y-0.5 pl-8 text-xs text-slate-600">
                  {edition.stories.slice(0, 8).map((story) => (
                    <li key={story._id}>{story.title}</li>
                  ))}
                  {edition.stories.length > 8 && <li className="list-none text-slate-400">and {edition.stories.length - 8} more</li>}
                </ol>
              )}
            </div>
          </div>

          {edition?.note && (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>{edition.note}</span>
            </p>
          )}

          <ol className="mt-4 space-y-3">
            {slots.map((slot) => (
              <li key={slot._id} className="rounded-xl border border-slate-200 p-3.5">
                <div className="flex flex-wrap items-start gap-3">
                  <label className="min-w-[180px] flex-1 text-xs font-semibold text-slate-600">
                    Programme name
                    <input value={slot.name} onChange={(event) => patch(slot._id, { name: event.target.value })} className={cn(input, 'mt-1')} placeholder="Morning news" maxLength={60} />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Starts at
                    <input type="time" value={slot.at} onChange={(event) => patch(slot._id, { at: event.target.value })} className={cn(input, 'mt-1 w-[120px]')} />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Stories
                    <input
                      type="number"
                      min={1}
                      max={25}
                      value={slot.storyCount}
                      onChange={(event) => patch(slot._id, { storyCount: Number(event.target.value) })}
                      className={cn(input, 'mt-1 w-[80px]')}
                    />
                  </label>
                  <div className="flex items-center gap-3 self-end pb-1">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                      <input type="checkbox" checked={slot.useAiScript} onChange={(event) => patch(slot._id, { useAiScript: event.target.checked })} className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
                      Gemini writes the intro
                    </label>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                      <input type="checkbox" checked={slot.enabled} onChange={(event) => patch(slot._id, { enabled: event.target.checked })} className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
                      On air
                    </label>
                    <button type="button" onClick={() => remove(slot._id)} aria-label={`Remove ${slot.name || 'this programme'}`} className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="font-semibold text-slate-600">Days</span>
                  {DAY_NAMES.map((name, day) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => toggleDay(slot._id, day)}
                      className={cn(
                        'rounded-full px-2.5 py-1 font-semibold transition',
                        slot.days.length === 0 || slot.days.includes(day)
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                      )}
                    >
                      {name}
                    </button>
                  ))}
                  {slot.days.length === 0 && <span className="text-slate-400">no days picked, so it runs every day</span>}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="font-semibold text-slate-600">Sections</span>
                  {categories.map((category) => (
                    <button
                      key={category._id}
                      type="button"
                      onClick={() => toggleCategory(slot._id, category._id)}
                      className={cn(
                        'rounded-full px-2.5 py-1 font-semibold transition',
                        slot.categories.includes(category._id) ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                      )}
                    >
                      {category.name}
                    </button>
                  ))}
                  {slot.categories.length > 0 && <span className="text-slate-400">only these sections</span>}
                  {slot.categories.length === 0 && <span className="text-slate-400">everything published</span>}
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setSlots((current) => [...current, blankSlot()])} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              <Plus className="h-4 w-4" /> Add a programme
            </button>
            <button type="button" onClick={() => void save()} disabled={isSaving || !slots.length} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-500 disabled:opacity-60">
              <Save className="h-4 w-4" />
              {isSaving ? 'Saving…' : 'Save timetable'}
            </button>
            <button type="button" onClick={() => void rebuild()} disabled={isRefreshing || !onAir?.current} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw className="h-4 w-4" />
              {isRefreshing ? 'Rebuilding…' : `Rebuild the ${onAir?.current?.at || ''} edition`}
            </button>
            <button type="button" onClick={() => void load()} className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100" aria-label="Reload the timetable">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          {error && <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-800">{error}</div>}
          {saved && !error && (
            <div role="status" className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm font-medium text-emerald-800">
              <Check className="h-4 w-4" /> {saved}
            </div>
          )}
        </>
      )}
    </section>
  )
}
