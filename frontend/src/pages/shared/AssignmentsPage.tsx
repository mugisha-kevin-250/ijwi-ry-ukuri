import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { CalendarClock, ClipboardList, RefreshCw, Send, UserRound } from 'lucide-react'
import { apiClient } from '../../services/apiClient'
import { useAuth } from '../../context/AuthContext'
import { can } from '../../utils/deskAccess'

type AssignmentStatus = 'assigned' | 'accepted' | 'in_progress' | 'submitted' | 'approved' | 'changes_requested' | 'cancelled'
type Person = { _id: string; fullName: string; username: string; role: string }
type Assignment = {
  _id: string; title: string; brief: string; desk: string; priority: string; status: AssignmentStatus
  dueAt: string; submissionNote?: string; assignedTo: Person; createdBy: Person
  article?: { _id: string; title: string; slug: string; status: string } | null
  events?: { action: string; from?: string; to?: string; note?: string; at: string; by: string }[]
}
const statuses: AssignmentStatus[] = ['assigned', 'accepted', 'in_progress', 'submitted', 'approved', 'changes_requested', 'cancelled']
const reporterStatuses: AssignmentStatus[] = ['accepted', 'in_progress', 'submitted']

function label(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter: string) => letter.toUpperCase())
}
function localDateTime(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

export default function AssignmentsPage() {
  const { user } = useAuth()
  const manager = can(user, 'review')
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [assignees, setAssignees] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [title, setTitle] = useState('')
  const [brief, setBrief] = useState('')
  const [desk, setDesk] = useState('General')
  const [priority, setPriority] = useState('normal')
  const [assignedTo, setAssignedTo] = useState('')
  const [dueAt, setDueAt] = useState(() => localDateTime(new Date(Date.now() + 86400000)))

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [assignmentResponse, assigneeResponse] = await Promise.all([
        apiClient.get('/assignments'),
        manager ? apiClient.get('/assignments/assignees') : Promise.resolve(null),
      ])
      const payload: any = assignmentResponse.data?.data
      setAssignments(Array.isArray(payload?.assignments) ? payload.assignments : [])
      const people: any[] = assigneeResponse ? (assigneeResponse.data as any)?.data?.users : []
      setAssignees(Array.isArray(people) ? people : [])
      if (!assignedTo && Array.isArray(people) && people[0]) setAssignedTo(people[0]._id)
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not load newsroom assignments.')
    } finally {
      setLoading(false)
    }
  }, [manager, assignedTo])

  useEffect(() => { void load() }, [load])

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true); setError(''); setNotice('')
    try {
      await apiClient.post('/assignments', { title, brief, desk, priority, assignedTo, dueAt: new Date(dueAt).toISOString() })
      setTitle(''); setBrief('')
      setNotice('Assignment created and added to the reporter’s desk.')
      await load()
    } catch (err: any) {
      setError(err?.response?.data?.message || 'The assignment could not be created.')
    } finally { setSaving(false) }
  }

  const changeStatus = async (assignment: Assignment, status: AssignmentStatus) => {
    setError(''); setNotice('')
    try {
      await apiClient.put(`/assignments/${assignment._id}/status`, { status })
      setNotice(`“${assignment.title}” moved to ${label(status)}.`)
      await load()
    } catch (err: any) {
      setError(err?.response?.data?.message || 'The assignment status could not be changed.')
    }
  }

  const priorityTone: Record<string, string> = {
    urgent: 'bg-rose-100 text-rose-800', high: 'bg-amber-100 text-amber-800',
    normal: 'bg-blue-50 text-blue-800', low: 'bg-slate-100 text-slate-700',
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">RADAR newsroom workflow</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Reporter assignments</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">{manager ? 'Create reporting briefs, assign an owner and deadline, and follow each story from assignment to submission.' : 'Review your reporting briefs, confirm an assignment, track your progress and submit your work to the editorial desk.'}</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
      </header>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{notice}</p>}

      {manager && (
        <form onSubmit={create} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-blue-700" /><h2 className="text-lg font-extrabold text-slate-950">Create a reporting assignment</h2></div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Assignment headline
              <input required maxLength={180} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Report on the new education policy" className="min-h-11 rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Reporter
              <select required value={assignedTo} onChange={e => setAssignedTo(e.target.value)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 font-normal outline-none focus:border-blue-600">
                <option value="">Choose a reporter</option>
                {assignees.map(person => <option key={person._id} value={person._id}>{person.fullName} (@{person.username}) · {label(person.role)}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-slate-700 md:col-span-2">Reporting brief
              <textarea required maxLength={8000} rows={4} value={brief} onChange={e => setBrief(e.target.value)} placeholder="Explain the story angle, key questions, sources to contact and expected deliverables…" className="rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Desk / section
              <input maxLength={80} value={desk} onChange={e => setDesk(e.target.value)} className="min-h-11 rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-blue-600" />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Deadline
              <input required type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)} className="min-h-11 rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-blue-600" />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Priority
              <select value={priority} onChange={e => setPriority(e.target.value)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 font-normal outline-none focus:border-blue-600">
                <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
              </select>
            </label>
          </div>
          <div><button type="submit" disabled={saving || !assignedTo} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50"><Send className="h-4 w-4" />{saving ? 'Creating…' : 'Assign reporter'}</button></div>
        </form>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-extrabold text-slate-950">{manager ? 'All newsroom assignments' : 'Assignments given to me'}</h2><span className="text-xs font-semibold text-slate-500">{assignments.length} records</span></div>
        {loading ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading assignments…</div> :
          assignments.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center"><ClipboardList className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 font-semibold text-slate-700">No assignments yet</p><p className="mt-1 text-sm text-slate-500">{manager ? 'Create the first reporting brief above.' : 'Your editor has not assigned a story to you yet.'}</p></div> :
          <div className="grid gap-3 lg:grid-cols-2">
            {assignments.map(assignment => {
              const overdue = new Date(assignment.dueAt).getTime() < Date.now() && !['submitted', 'approved', 'cancelled'].includes(assignment.status)
              const canUpdate = manager || (assignment.assignedTo?._id === user?._id && ['assigned', 'accepted', 'in_progress', 'changes_requested'].includes(assignment.status))
              return <article key={assignment._id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${priorityTone[assignment.priority] || priorityTone.normal}`}>{label(assignment.priority)} priority</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700">{label(assignment.status)}</span>{overdue && <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-bold text-rose-800">Overdue</span>}</div>
                <h3 className="mt-3 break-words text-base font-extrabold text-slate-950">{assignment.title}</h3>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-600">{assignment.brief}</p>
                <div className="mt-4 grid gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500 sm:grid-cols-2">
                  <p className="flex items-center gap-2"><UserRound className="h-4 w-4 shrink-0" /> {assignment.assignedTo?.fullName || 'Reporter'}</p>
                  <p className="flex items-center gap-2"><CalendarClock className="h-4 w-4 shrink-0" /> Due {new Date(assignment.dueAt).toLocaleString()}</p>
                  <p>Desk: {assignment.desk || 'General'}</p>
                  <p>Assigned by: {assignment.createdBy?.fullName || 'Editorial desk'}</p>
                </div>
                {assignment.article && <p className="mt-3 text-xs text-blue-700">Linked story: {assignment.article.title}</p>}
                {assignment.submissionNote && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">Reporter note: {assignment.submissionNote}</p>}
                {canUpdate && <div className="mt-4 flex flex-wrap items-center gap-2">
                  <label className="text-xs font-semibold text-slate-600" htmlFor={`status-${assignment._id}`}>Update status</label>
                  <select id={`status-${assignment._id}`} value={assignment.status} onChange={e => void changeStatus(assignment, e.target.value as AssignmentStatus)} className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 text-sm">
                    {(manager ? statuses : [...new Set([assignment.status, ...reporterStatuses])]).map(status => <option key={status} value={status}>{label(status)}</option>)}
                  </select>
                </div>}
              </article>
            })}
          </div>}
      </section>
    </div>
  )
}
