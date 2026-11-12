import { useCallback, useEffect, useState } from 'react'
import { Archive, CheckCircle2, Inbox, Loader2, Mail, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import { adminAPI } from '../../services/api'
import type { ContactMessageRecord } from '../../services/api'
import { useAuth } from '../../context/AuthContext'

const FILTERS: { value: string; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'answered', label: 'Answered' },
  { value: 'closed', label: 'Closed' },
  { value: 'ALL', label: 'Everything' },
]

const TOPIC_LABELS: Record<ContactMessageRecord['topic'], string> = {
  correction: 'Correction',
  'story-tip': 'Story tip',
  advertising: 'Advertising',
  'writer-access': 'Writer access',
  other: 'Something else',
}

function statusBadge(status: ContactMessageRecord['status']): string {
  switch (status) {
    case 'answered': return 'bg-emerald-50 text-emerald-700'
    case 'closed': return 'bg-slate-100 text-slate-600'
    default: return 'bg-amber-50 text-amber-700'
  }
}

function ago(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(iso).toLocaleDateString()
}

export default function AdminMessagesPage() {
  const { user } = useAuth()
  const [messages, setMessages] = useState<ContactMessageRecord[]>([])
  const [openCount, setOpenCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [filter, setFilter] = useState('open')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const inbox = await adminAPI.getContactMessages(filter === 'ALL' ? undefined : filter)
      setMessages(inbox.messages)
      setOpenCount(inbox.openCount)
    } catch (err: any) {
      setError(err?.response?.data?.message || 'We could not load the messages. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  const setStatus = async (id: string, status: ContactMessageRecord['status']) => {
    setBusyId(id)
    setActionError('')
    try {
      await adminAPI.setContactMessageStatus(id, status)
      await load()
    } catch (err: any) {
      setActionError(err?.response?.data?.message || 'That change could not be saved.')
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (id: string) => {
    if (!window.confirm('Delete this message? The reader\'s address and what they wrote go with it.')) return
    setBusyId(id)
    setActionError('')
    try {
      await adminAPI.deleteContactMessage(id)
      await load()
    } catch (err: any) {
      setActionError(err?.response?.data?.message || 'That message could not be deleted.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-blue-700">Newsroom</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">Reader messages</h1>
          <p className="mt-1 text-sm text-slate-500">
            What the contact form sends in. Nothing here is published - it is the reader talking to us.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${filter === option.value ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {option.label}
              {option.value === 'open' && openCount > 0 ? ` (${openCount})` : ''}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{error}</span>
          <button type="button" onClick={() => void load()} className="font-bold underline">Retry</button>
        </div>
      )}
      {actionError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError('')} className="font-bold underline">Dismiss</button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="space-y-3 p-5">{[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-lg bg-slate-100" />)}</div>
        ) : messages.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Inbox className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">
              {filter === 'ALL'
                ? 'Nothing has come in through the contact form yet.'
                : `No messages are "${filter}".`}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {messages.map((message) => (
              <li key={message._id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{message.name}</p>
                    <a href={`mailto:${message.email}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:underline">
                      <Mail className="h-3.5 w-3.5" />{message.email}
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{TOPIC_LABELS[message.topic]}</span>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${statusBadge(message.status)}`}>{message.status}</span>
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{message.message}</p>
                <p className="mt-2 text-xs text-slate-400">
                  Arrived {ago(message.createdAt)}
                  {message.handledBy && (
                    <> · handled by {message.handledBy.fullName || message.handledBy.username} {message.handledAt ? ago(message.handledAt) : ''}</>
                  )}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {message.status === 'open' && (
                    <button
                      type="button"
                      disabled={busyId === message._id}
                      onClick={() => void setStatus(message._id, 'answered')}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
                    >
                      {busyId === message._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Mark answered
                    </button>
                  )}
                  {message.status !== 'closed' && (
                    <button
                      type="button"
                      disabled={busyId === message._id}
                      onClick={() => void setStatus(message._id, 'closed')}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-200 disabled:opacity-60"
                    >
                      <Archive className="h-3.5 w-3.5" />Close
                    </button>
                  )}
                  {message.status !== 'open' && (
                    <button
                      type="button"
                      disabled={busyId === message._id}
                      onClick={() => void setStatus(message._id, 'open')}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 transition hover:bg-amber-100 disabled:opacity-60"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />Reopen
                    </button>
                  )}
                  {user?.role === 'ADMIN' && (
                    <button
                      type="button"
                      disabled={busyId === message._id}
                      onClick={() => void remove(message._id)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                    >
                      <Trash2 className="h-3.5 w-3.5" />Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
