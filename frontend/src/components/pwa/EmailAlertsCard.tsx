import { useEffect, useMemo, useState } from 'react'
import { Mail, MailWarning, Save } from 'lucide-react'
import { useI18n } from '../../context/I18nContext'
import { useAuth } from '../../context/AuthContext'
import { newsletterAPI, type NewsletterSubscription } from '../../services/api'
import { SECTIONS } from '../../data/sections'

/**
 * The three languages the mail server has words for, named in their own
 * spelling. The codes come from the server rather than from here - this list
 * only prints them, and an unknown code falls back to the code itself.
 */
const ALERT_LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  rw: 'Kinyarwanda',
  fr: 'Français',
}

/**
 * The reader's own mail desk.
 *
 * Push alerts are a property of a device; this is the other channel - the
 * address on the account - and it is the one the newsroom actually mails when a
 * story goes live. The three things a reader can decide are kept here rather
 * than in a mail they have to dig out of an inbox: which desks they want, in
 * which language, and whether to stop.
 *
 * Nothing on this card claims a mail was delivered. The status is the server's,
 * so an address that has not opened a confirmation link reads as "waiting for
 * you", and a site with no mail sender says so out loud.
 */
export default function EmailAlertsCard() {
  const { t } = useI18n()
  const { user } = useAuth()
  const [subscription, setSubscription] = useState<NewsletterSubscription | null>(null)
  const [languages, setLanguages] = useState<string[]>(['en'])
  const [mailReady, setMailReady] = useState(true)
  const [loading, setLoading] = useState(true)
  const [sections, setSections] = useState<string[]>([])
  const [language, setLanguage] = useState('en')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const deskChoices = useMemo(
    () => SECTIONS.filter((section) => section.slug !== 'trending').map((section) => ({
      slug: section.slug,
      label: t(section.labelKey),
    })),
    [t],
  )

  const load = async () => {
    setLoading(true)
    try {
      const [mine, status] = await Promise.all([newsletterAPI.getMe(), newsletterAPI.getStatus()])
      setSubscription(mine.subscription)
      setLanguages(mine.languages.length ? mine.languages : status.languages)
      setMailReady(status.configured)
      setSections(mine.subscription?.sections || [])
      setLanguage(mine.subscription?.language || 'en')
    } catch (err: any) {
      setError(err?.response?.data?.message || t('alerts.mailLoadFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) void load()
  }, [user])

  const toggleDesk = (slug: string) => {
    setNote('')
    setSections((current) => (current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug]))
  }

  const dirty = !!subscription
    && (sections.join('|') !== (subscription.sections || []).join('|') || language !== subscription.language)

  /**
   * One press, two server calls.
   *
   * An address that has never been on the list has to be added, which is the
   * subscribe route and prints the confirmation mail; an address already on it
   * only has its choices rewritten. Either way the row is read back rather than
   * guessed at, because the status is the server's to know.
   */
  const save = async () => {
    setBusy(true)
    setNote('')
    setError('')
    try {
      if (!subscription) {
        if (!user?.email) {
          setError(t('alerts.mailNoAddress'))
          return
        }
        const result = await newsletterAPI.subscribe(user.email, 'account', { sections, language })
        await load()
        if (result.delivered) {
          setNote('Confirmation email accepted by the mail provider. Check your inbox and spam folder, then open the confirmation link.')
        } else if (result.queued) {
          setNote('Your address is saved. The mail server is still processing the confirmation email; check your inbox shortly.')
        } else if (!result.configured) {
          setError(`Your address was saved, but no email was sent because the newsroom mail service is not configured. ${result.deliveryReason || ''}`.trim())
        } else if (!result.needsConfirmation) {
          setNote('This email address is already confirmed for RADAR alerts.')
        } else {
          setError(`Your address was saved, but the confirmation email was not accepted by the mail provider. ${result.deliveryReason || 'Ask the newsroom administrator to check the Mail desk.'}`)
        }
        return
      }
      const result = await newsletterAPI.updateMe({ sections, language })
      if (result.subscription) setSubscription(result.subscription)
      setNote(t('alerts.mailSaved'))
    } catch (err: any) {
      setError(err?.response?.data?.message || t('alerts.mailSaveFailed'))
    } finally {
      setBusy(false)
    }
  }

  /**
   * Stopping and starting are the same two presses the links in a mail make,
   * reached from the account. Starting asks for a fresh confirmation mail
   * rather than flipping the switch itself, because an address is only ever
   * proved by somebody opening it.
   */
  const press = async (input: { stop?: boolean; start?: boolean }, said: string) => {
    setBusy(true)
    setNote('')
    setError('')
    try {
      const result = await newsletterAPI.updateMe(input)
      if (result.subscription) setSubscription(result.subscription)
      setNote(t(said))
    } catch (err: any) {
      setError(err?.response?.data?.message || t('alerts.mailSaveFailed'))
    } finally {
      setBusy(false)
    }
  }

  const status = subscription?.status
  const statusLine = !subscription
    ? 'alerts.mailNone'
    : status === 'confirmed'
      ? 'alerts.mailOn'
      : status === 'pending'
        ? 'alerts.mailPending'
        : 'alerts.mailStopped'

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
          <Mail className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-slate-900">{t('alerts.mailTitle')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('alerts.mailDesc')}</p>

          {loading && <p className="mt-3 text-sm text-slate-400">{t('alerts.mailLoading')}</p>}

          {!loading && (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <p translate="no" className="text-sm font-semibold text-slate-700">
                  {subscription?.email || user?.email || t('alerts.mailNoAddress')}
                </p>
                <p className={`text-xs font-bold ${status === 'confirmed' ? 'text-emerald-700' : 'text-slate-500'}`}>
                  {t(statusLine)}
                </p>
              </div>

              {!mailReady && (
                <p className="mt-2 flex items-start gap-1.5 text-xs font-semibold text-amber-700">
                  <MailWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {t('alerts.mailNotConfigured')}
                </p>
              )}

              {(subscription || user?.email) && (
                <>
                  <fieldset className="mt-4">
                    <legend className="text-sm font-bold text-slate-800">{t('alerts.mailDesks')}</legend>
                    <p className="mt-0.5 text-xs text-slate-500">{t('alerts.mailDesksHint')}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {deskChoices.map((desk) => {
                        const picked = sections.includes(desk.slug)
                        return (
                          <button
                            key={desk.slug}
                            type="button"
                            aria-pressed={picked}
                            disabled={busy}
                            onClick={() => toggleDesk(desk.slug)}
                            className={`rounded-full border px-3 py-1 text-xs font-bold transition disabled:opacity-60 ${
                              picked
                                ? 'border-blue-700 bg-blue-700 text-white'
                                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {desk.label}
                          </button>
                        )
                      })}
                    </div>
                  </fieldset>

                  <label className="mt-4 flex flex-wrap items-center gap-2 text-sm font-bold text-slate-800">
                    {t('alerts.mailLanguage')}
                    <select
                      value={language}
                      disabled={busy}
                      onChange={(event) => setLanguage(event.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-60"
                    >
                      {languages.map((code) => (
                        <option key={code} value={code}>
                          {ALERT_LANGUAGE_NAMES[code] || code}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs font-normal text-slate-500">{t('alerts.mailLanguageHint')}</span>
                  </label>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void save()}
                      disabled={busy || (!!subscription && !dirty)}
                      className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-800 disabled:opacity-60"
                    >
                      <Save className="h-4 w-4" aria-hidden="true" />
                      {t(subscription ? 'alerts.mailSave' : 'alerts.mailAsk')}
                    </button>

                    {subscription && status !== 'unsubscribed' && (
                      <button
                        type="button"
                        onClick={() => void press({ stop: true }, 'alerts.mailStopDone')}
                        disabled={busy}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                      >
                        {t('alerts.mailStop')}
                      </button>
                    )}

                    {subscription && status !== 'confirmed' && (
                      <button
                        type="button"
                        onClick={() => void press({ start: true }, 'alerts.mailStartDone')}
                        disabled={busy}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                      >
                        {t('alerts.mailStart')}
                      </button>
                    )}
                  </div>
                </>
              )}

              {!subscription && !user?.email && (
                <p className="mt-3 text-xs font-semibold text-slate-500">{t('alerts.mailNoAddress')}</p>
              )}

              {note && <p role="status" className="mt-2 text-xs font-semibold text-emerald-700">{note}</p>}
              {error && <p role="alert" className="mt-2 text-xs font-semibold text-red-700">{error}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
