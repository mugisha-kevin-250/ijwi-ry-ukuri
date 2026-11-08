import { useEffect, useRef, useState } from 'react'
import { Bell, Check, Download, X } from 'lucide-react'
import { useI18n } from '../../context/I18nContext'
import { pushAPI } from '../../services/api'
import { isStandalone } from '../../pwa/serviceWorker'
import { enablePushNotifications, pushSupported } from '../../pwa/pushNotifications'
import { cn } from '../../utils/cn'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'pwa-install-dismissed-at'
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000
const REVEAL_DELAY_MS = 4000

type Variant = 'install' | 'notifications' | 'ios' | null

function recentlyDismissed(): boolean {
  const stored = Number(localStorage.getItem(DISMISS_KEY) || 0)
  return Boolean(stored) && Date.now() - stored < DISMISS_COOLDOWN_MS
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window) && !isStandalone()
}

// Someone who is already working in a dashboard is not a visitor to convert, and
// pulling the floor out from under their editor would lose a draft.
function isWorkspacePath(): boolean {
  return ['/writer', '/mugishaimekevin'].some((path) => window.location.pathname.startsWith(path))
}

export default function InstallPromptBanner() {
  const { t } = useI18n()
  const [variant, setVariant] = useState<Variant>(null)
  const [busy, setBusy] = useState(false)
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    // Installed app windows cannot install again, but they are the best place
    // for alerts - the OS delivers them even when the app is closed.
    if (recentlyDismissed() || isWorkspacePath()) return

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      promptRef.current = event as BeforeInstallPromptEvent
      setVariant('install')
    }

    if (isIosSafari()) {
      // iOS has no install event to wait for, so the manual route is shown at once.
      setVariant('ios')
      return
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    const timer = window.setTimeout(async () => {
      if (promptRef.current || isStandalone()) return
      if (!pushSupported()) return
      // Asking for permission when the server cannot deliver anything is noise.
      const enabled = await pushAPI
        .getStatus()
        .then((response) => Boolean(response.data.data?.enabled))
        .catch(() => false)
      if (enabled) setVariant('notifications')
    }, REVEAL_DELAY_MS)

    const onInstalled = () => {
      promptRef.current = null
      setVariant(null)
    }
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  // The sheet covers the page, so the story behind it must not scroll past it.
  useEffect(() => {
    if (variant !== 'install' && variant !== 'ios') return undefined
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [variant])

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setVariant(null)
  }

  // No cooldown: the browser sheet was closed without an answer, so the reader
  // simply gets the banner back on the next visit instead of a week of silence.
  const close = () => setVariant(null)

  const install = async () => {
    const deferred = promptRef.current
    if (!deferred) return
    setBusy(true)
    await deferred.prompt()
    const choice = await deferred.userChoice
    promptRef.current = null
    setBusy(false)
    if (choice.outcome === 'accepted') setVariant(null)
    else close()
  }

  const enableUpdates = async () => {
    setBusy(true)
    try {
      await enablePushNotifications()
      setVariant(null)
    } catch {
      // Denied or unsupported: hide the banner rather than nag on every visit.
      dismiss()
    } finally {
      setBusy(false)
    }
  }

  if (!variant) return null

  if (variant === 'notifications') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed inset-x-0 bottom-0 z-50 px-3 pb-3 sm:px-4 sm:pb-4"
        style={{ animation: 'pwa-banner-in 420ms ease-out' }}
      >
        <div className="mx-auto flex max-w-2xl items-center gap-3 rounded-xl border border-blue-200 bg-white p-3 shadow-lg sm:gap-4 sm:p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#1877F2] text-white">
            <Bell className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-900">{t('pwa.updateTitle')}</p>
            <p className="mt-0.5 line-clamp-2 text-xs text-slate-600 sm:text-sm">{t('pwa.updateBody')}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void enableUpdates()}
              disabled={busy}
              className="rounded-lg bg-[#1877F2] px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-[#166fe5] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 disabled:opacity-60 sm:text-sm"
            >
              {t('pwa.updateAction')}
            </button>
            <button
              type="button"
              onClick={dismiss}
              aria-label={t('pwa.dismiss')}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500',
                'transition-colors hover:bg-slate-50 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
              )}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  const isIos = variant === 'ios'
  const features = ['pwa.featureNews', 'pwa.featureAlerts', 'pwa.featureOffline']

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-sheet-title"
      className="fixed inset-0 z-[90] flex flex-col justify-end bg-[#062b52]/95 px-4 pb-5 pt-10 sm:items-center sm:justify-center"
    >
      <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-center gap-3">
          <img
            src="/icons/icon-192x192.png"
            alt=""
            className="h-14 w-14 shrink-0 rounded-xl object-contain"
            onError={(event) => {
              event.currentTarget.src = '/favicon.svg'
            }}
          />
          <p id="install-sheet-title" className="text-lg font-extrabold leading-snug text-slate-900">
            {isIos ? t('pwa.iosTitle') : t('pwa.installTitle')}
          </p>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          {isIos ? t('pwa.iosBody') : t('pwa.installBody')}
        </p>

        <ul className="mt-4 space-y-2">
          {features.map((key) => (
            <li key={key} className="flex items-start gap-2 text-sm text-slate-700">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#1877F2]" aria-hidden="true" />
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => (isIos ? dismiss() : void install())}
          disabled={busy}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1877F2] px-4 py-3.5 text-base font-bold text-white transition-colors hover:bg-[#166fe5] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          <Download className="h-5 w-5" aria-hidden="true" />
          {isIos ? t('pwa.gotIt') : t('pwa.installAction')}
        </button>
        <button
          type="button"
          onClick={isIos ? dismiss : close}
          className="mt-2 w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          {t('pwa.notNow')}
        </button>
      </div>
    </div>
  )
}
