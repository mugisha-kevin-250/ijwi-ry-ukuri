import { useCallback, useEffect, useState } from 'react'
import { Mail, RefreshCw, Send, TriangleAlert } from 'lucide-react'
import { adminAPI } from '../../services/api'
import type { MailAttemptRecord, MailDeskStatus } from '../../services/api'
import { useAuth } from '../../context/AuthContext'

/**
 * The mail desk.
 *
 * This page exists because "the email is not coming" used to be undiagnosable:
 * the server could accept a subscription, be refused by the relay two seconds
 * later, and nothing on any screen would ever show the refusal. Everything here
 * is read from the relay's own reporting - the settings it was given, the answer
 * it got, and the sentence the relay said when it said no.
 *
 * Addresses are shown masked, the same way the server stores them, so the desk
 * can be open on screen without a reader's address being readable off it.
 */

/**
 * The four purposes the server actually mails under, kept to what
 * mailerService records so this desk never names a mail the newsroom does not
 * send. Sign-in and password-reset codes share one purpose and differ only by
 * the subject printed beside them.
 */
const PURPOSE_LABELS: Record<string, string> = {
  'signin-code': 'Sign-in or reset code',
  'newsletter-confirm': 'Newsletter confirmation',
  'story-alert': 'New story alert',
  test: 'Test from this desk',
  mail: 'A mail',
}

const OUTCOME_STYLES: Record<string, string> = {
  sent: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  queued: 'bg-sky-50 text-sky-700 border-sky-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  'not-configured': 'bg-amber-50 text-amber-800 border-amber-200',
  abandoned: 'bg-slate-100 text-slate-600 border-slate-200',
}

const OUTCOME_LABELS: Record<string, string> = {
  sent: 'Delivered to the relay',
  queued: 'Answered, relay still talking',
  rejected: 'Refused by the relay',
  'not-configured': 'Never attempted - no relay set',
  abandoned: 'Given up on',
}

const KEY_LABELS: Record<string, string> = {
  SMTP_HOST: 'SMTP_HOST — the relay address',
  SMTP_PORT: 'SMTP_PORT — usually 587',
  SMTP_USER: 'SMTP_USER — the api key',
  SMTP_PASSWORD: 'SMTP_PASSWORD — the smtp secret',
  MAIL_FROM_EMAIL: 'MAIL_FROM_EMAIL — the sender address',
}

function ago(iso: string): string {
  if (!iso) return ''
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(iso).toLocaleDateString()
}

export default function AdminMailPage() {
  const { user } = useAuth()
  const [status, setStatus] = useState<MailDeskStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [to, setTo] = useState(String(user?.email || ''))
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setStatus(await adminAPI.getMailStatus())
    } catch (err: any) {
      setError(err?.response?.data?.message || 'We could not read the mail desk. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const sendTest = async () => {
    setSending(true)
    setResult(null)
    try {
      const attempt = await adminAPI.testMail(to.trim())
      setResult(attempt.delivered
        ? {
          ok: true,
          text: `The relay took the mail from ${attempt.from}. If it is not in the inbox within a minute, look in junk and then check the sender is a verified address with the provider.`,
        }
        : {
          ok: false,
          text: attempt.reason
            || `The relay refused the mail${attempt.host ? ` while talking to ${attempt.host}` : ''}.`,
        })
      // The attempt is in the log the moment the relay answers, so the table
      // under this box is refreshed with it rather than left showing the
      // situation before the press.
      void load()
    } catch (err: any) {
      // Only a failure with no answer in it reaches here: the cooldown, a bad
      // address, or the wire. The server's own sentence comes first, and the
      // connection message the API client already writes for a reader second.
      const data = err?.response?.data as { message?: string } | undefined
      setResult({
        ok: false,
        text: data?.message
          || err?.message
          || 'We could not reach the mail desk for the test. Check your connection and try again.',
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-blue-700">Newsroom</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">Mail desk</h1>
          <p className="mt-1 text-sm text-slate-500">
            Sign-in codes, password resets, confirmations and story alerts all leave through one relay.
            This is what it is set to, and what it answered.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60">
          <RefreshCw className={`h-4 w-4${loading ? ' animate-spin' : ''}`} />Refresh
        </button>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{error}</span>
          <button type="button" onClick={() => void load()} className="font-bold underline">Retry</button>
        </div>
      )}

      {loading && !status ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {[1, 2, 3].map((item) => <div key={item} className="h-10 animate-pulse rounded-lg bg-slate-100" />)}
        </div>
      ) : status ? (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${status.configured ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                <Mail className="h-3.5 w-3.5" />
                {status.configured ? 'A relay is set' : 'No relay is set'}
              </span>
              {status.host && <span className="text-sm text-slate-600">via <span className="font-semibold">{status.host}</span></span>}
              {status.from && <span className="text-sm text-slate-600">from <span className="font-semibold">{status.from}</span></span>}
            </div>

            {!status.configured && (
              <p className="mt-3 text-sm text-slate-600">
                {status.reason || 'The server has no SMTP relay to send through, so nothing is mailed.'}
              </p>
            )}
            {status.warning && (
              <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{status.warning}</span>
              </p>
            )}

            <ul className="mt-4 grid gap-1.5 text-sm sm:grid-cols-2">
              {Object.keys(KEY_LABELS).map((key) => (
                <li key={key} className="flex items-center gap-2">
                  <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${status.keys[key as keyof MailDeskStatus['keys']] ? 'bg-emerald-500' : 'bg-red-400'}`} />
                  <span className="font-mono text-xs text-slate-600">{KEY_LABELS[key].split(' — ')[0]}</span>
                  <span className="text-xs text-slate-500">{KEY_LABELS[key].split(' — ')[1]}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate-500">
              These are environment values set on the hosting dashboard, not on this site. A green dot means the
              server was given a value; it cannot say whether that value is the current one.
            </p>

            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              <span className="rounded-lg bg-slate-50 px-3 py-1.5 text-slate-700">
                <span className="font-bold">{status.last24Hours.delivered}</span> mails taken in the last 24 hours
              </span>
              <span className={`rounded-lg px-3 py-1.5 ${status.last24Hours.refused > 0 ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-700'}`}>
                <span className="font-bold">{status.last24Hours.refused}</span> refused or never attempted
              </span>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900">Send one test mail</h2>
            <p className="mt-1 text-sm text-slate-500">
              This asks the relay for the whole conversation and waits for its answer, so a refusal arrives here as
              the provider's own sentence instead of a silent timeout. One mail per thirty seconds.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="email"
                value={to}
                onChange={(event) => { setTo(event.target.value); setResult(null) }}
                placeholder="you@example.com"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <button
                type="button"
                onClick={() => void sendTest()}
                disabled={sending || !to.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
              >
                <Send className="h-4 w-4" />{sending ? 'Waiting for the relay…' : 'Send test'}
              </button>
            </div>
            {result && (
              <p role="status" className={`mt-3 rounded-lg border px-3 py-2 text-sm ${result.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
                {result.text}
              </p>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-3">
              <h2 className="text-sm font-bold text-slate-900">What the relay answered</h2>
              <p className="mt-0.5 text-xs text-slate-500">The last mails the server tried to send. Addresses are stored masked, and thirty days of history is kept.</p>
            </div>
            {status.last.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-500">
                No mail has been attempted since this log started. Send a test, or ask a reader to sign in, and it will appear here.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {status.last.map((attempt: MailAttemptRecord, index) => (
                  <li key={`${attempt.at}-${index}`} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {PURPOSE_LABELS[attempt.purpose] || attempt.purpose}
                        <span className="ml-2 font-mono text-xs font-normal text-slate-500">{attempt.recipient}</span>
                      </p>
                      {attempt.reason && <p className="mt-1 break-words text-xs text-red-700">{attempt.reason}</p>}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${OUTCOME_STYLES[attempt.outcome] || 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                        {OUTCOME_LABELS[attempt.outcome] || attempt.outcome}
                      </span>
                      <span className="text-[11px] text-slate-400">{ago(attempt.at)}{attempt.ms ? ` · ${attempt.ms} ms` : ''}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}
