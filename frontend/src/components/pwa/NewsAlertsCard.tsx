import { useEffect, useState } from 'react'
import { Bell, BellOff, Loader2 } from 'lucide-react'
import { useI18n } from '../../context/I18nContext'
import { pushAPI } from '../../services/api'
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
 */
export default function NewsAlertsCard() {
  const { t } = useI18n()
  const [supported, setSupported] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
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
        </div>
      </div>
    </div>
  )
}
