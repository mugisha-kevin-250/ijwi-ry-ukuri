import { useEffect, useState } from 'react'
import { Bell, BellOff, Loader2, Mail } from 'lucide-react'
import { useI18n } from '../../context/I18nContext'
import { useAuth } from '../../context/AuthContext'
import { newsletterAPI, pushAPI } from '../../services/api'
import { isStandalone } from '../../pwa/serviceWorker'
import {
  disablePushNotifications,
  enablePushNotifications,
  isSubscribedToPush,
  notificationPermission,
  pushSupported,
} from '../../pwa/pushNotifications'

/**
 * The reader's switch for real background alerts. Push is delivered by the
 * operating system, so a message still arrives while the phone sleeps or the
 * tab is closed - but only once this device has subscribed.
 *
 * A signed-in reader can ask for the same news by email as well. That is a
 * second channel, and it only switches on after the reader taps the link in
 * the mail we send, so the card reports which of the three things happened
 * rather than claiming a subscription that does not exist yet.
 */
export default function NewsAlertsCard() {
  const { t } = useI18n()
  const { user } = useAuth()
  const [supported, setSupported] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [serverReady, setServerReady] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailNote, setEmailNote] = useState('')

  useEffect(() => {
    let active = true
    const read = async () => {
      if (!active) return
      setSupported(pushSupported())
      setPermission(notificationPermission())
      setSubscribed(await isSubscribedToPush().catch(() => false))
      const enabled = await pushAPI
        .getStatus()
        .then((response) => Boolean(response.data.data?.enabled))
        .catch(() => false)
      if (active) setServerReady(enabled)
    }
    void read()
    return () => {
      active = false
    }
  }, [])

  const askForEmailAlerts = async () => {
    if (!user?.email) return
    setEmailBusy(true)
    setEmailNote('')
    setError('')
    try {
      const result = await newsletterAPI.subscribe(user.email, 'account')
      // The server's own answer decides the words: a mail left this server, or
      // it could not, or the address was already on the list.
      if (!result.needsConfirmation) setEmailNote(t('home.newsletterAlready'))
      else if (result.delivered) setEmailNote(t('home.newsletterMailed'))
      else setEmailNote(t('home.newsletterNotMailing'))
    } catch (err: any) {
      setError(err?.response?.data?.message || t('home.newsletterFailed'))
    } finally {
      setEmailBusy(false)
    }
  }

  const toggle = async () => {
    setError('')
    setBusy(true)
    try {
      if (subscribed) {
        await disablePushNotifications()
        setSubscribed(false)
      } else {
        await enablePushNotifications()
        setSubscribed(true)
      }
      setPermission(notificationPermission())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('alerts.error'))
    } finally {
      setBusy(false)
    }
  }

  const needsInstall = supported && /iPad|iPhone|iPod/.test(navigator.userAgent) && !isStandalone()
  // A reader who blocked notifications once cannot be prompted again, so the
  // switch would only ever fail - tell them where to unblock it instead.
  const blocked = supported && serverReady && permission === 'denied' && !subscribed

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
          <Bell className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-slate-900">{t('alerts.title')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('alerts.desc')}</p>

          {!supported && <p className="mt-2 text-xs font-semibold text-amber-700">{t('alerts.unsupported')}</p>}
          {supported && !serverReady && <p className="mt-2 text-xs font-semibold text-slate-500">{t('alerts.unavailable')}</p>}
          {needsInstall && serverReady && <p className="mt-2 text-xs font-semibold text-slate-500">{t('alerts.installFirst')}</p>}
          {blocked && <p className="mt-2 text-xs font-semibold text-slate-500">{t('alerts.blocked')}</p>}

          {supported && serverReady && !blocked && (
            <button
              type="button"
              onClick={() => void toggle()}
              disabled={busy || needsInstall}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-800 disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : subscribed ? (
                <BellOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Bell className="h-4 w-4" aria-hidden="true" />
              )}
              {subscribed ? t('alerts.disable') : t('alerts.enable')}
            </button>
          )}

          {subscribed && !busy && (
            <p role="status" className="mt-2 text-xs font-semibold text-emerald-700">
              {t('alerts.on')}
            </p>
          )}
          {error && <p role="alert" className="mt-2 text-xs font-semibold text-red-700">{error}</p>}

          {user?.email && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => void askForEmailAlerts()}
                disabled={emailBusy}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {emailBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {t('alerts.emailButton')}
              </button>
              <p className="mt-1 text-xs text-slate-400" translate="no">{user.email}</p>
              {emailNote && (
                <p role="status" className="mt-1 text-xs font-semibold text-slate-600">{emailNote}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
