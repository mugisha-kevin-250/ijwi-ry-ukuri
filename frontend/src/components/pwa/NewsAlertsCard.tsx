import { useEffect, useState } from 'react'
import { Bell, BellOff, VolumeX } from 'lucide-react'
import { useI18n } from '../../context/I18nContext'
import { pushAPI } from '../../services/api'
import { isStandalone } from '../../pwa/serviceWorker'
import {
  disablePushNotifications,
  enablePushNotifications,
  isSubscribedToPush,
  notificationPermission,
  pushSupported,
  quietStoredLocally,
  setQuietAlerts,
} from '../../pwa/pushNotifications'

/**
 * The reader's switch for real background alerts. Push is delivered by the
 * operating system, so a message still arrives while the phone sleeps or the
 * tab is closed - but only once this device has subscribed.
 *
 * A signed-in reader can ask for the same news by email as well. That is a
 * second channel, and it belongs on the account screen rather than here,
 * because the choices it needs - which desks, in which language, and whether
 * to stop - are the reader's and outlive this device. This card is the switch
 * for the machine in front of the reader, and says which of its three states
 * it is in.
 */
export default function NewsAlertsCard() {
  const { t } = useI18n()
  const [supported, setSupported] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [quiet, setQuiet] = useState(quietStoredLocally)
  const [quietBusy, setQuietBusy] = useState(false)
  const [quietNote, setQuietNote] = useState('')
  const [serverReady, setServerReady] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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

  /**
   * Quiet is a property of the device, not of the account. A phone carried to a
   * meeting and a phone left on a bedside table want opposite things, and the
   * only place that can be decided is here, once per install.
   */
  const toggleQuiet = async (next: boolean) => {
    setQuietBusy(true)
    setQuietNote('')
    setError('')
    const before = quiet
    setQuiet(next)
    try {
      await setQuietAlerts(next)
      setQuietNote(t('alerts.quietSaved'))
    } catch (err: any) {
      setQuiet(before)
      setError(err?.response?.data?.message || err?.message || t('alerts.quietFailed'))
    } finally {
      setQuietBusy(false)
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
              {subscribed ? (
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

          {subscribed && (
            <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3">
              <input
                type="checkbox"
                checked={quiet}
                disabled={quietBusy}
                onChange={(event) => void toggleQuiet(event.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-700 focus:ring-blue-200"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                  <VolumeX className="h-4 w-4 text-slate-500" aria-hidden="true" />
                  {t('alerts.quiet')}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">{t('alerts.quietDesc')}</span>
                {quietNote && (
                  <span role="status" className="mt-1 block text-xs font-semibold text-emerald-700">{quietNote}</span>
                )}
              </span>
            </label>
          )}
          {error && <p role="alert" className="mt-2 text-xs font-semibold text-red-700">{error}</p>}
        </div>
      </div>
    </div>
  )
}
