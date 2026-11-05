import { useEffect, useRef, useState } from 'react'
import { Bell, Download, X } from 'lucide-react'
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

export default function InstallPromptBanner() {
  const { t } = useI18n()
  const [variant, setVariant] = useState<Variant>(null)
  const [busy, setBusy] = useState(false)
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return

    // A browser that can install gives us a real prompt; iOS Safari needs the
    // manual Add to Home Screen route; everyone else can still turn on updates.
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      promptRef.current = event as BeforeInstallPromptEvent
      setVariant('install')
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    const timer = window.setTimeout(async () => {
      if (promptRef.current) return
      if (isIosSafari()) {
        setVariant('ios')
        return
      }
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

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setVariant(null)
  }

  const install = async () => {
    const deferred = promptRef.current
    if (!deferred) return
    setBusy(true)
    await deferred.prompt()
    const choice = await deferred.userChoice
    if (choice.outcome === 'accepted') promptRef.current = null
    setBusy(false)
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

  const copy = {
    install: {
      title: t('pwa.installTitle'),
      body: t('pwa.installBody'),
      action: t('pwa.installAction'),
      onAction: install,
      icon: Download,
    },
    notifications: {
      title: t('pwa.updateTitle'),
      body: t('pwa.updateBody'),
      action: t('pwa.updateAction'),
      onAction: enableUpdates,
      icon: Bell,
    },
    ios: {
      title: t('pwa.iosTitle'),
      body: t('pwa.iosBody'),
      action: t('pwa.gotIt'),
      onAction: dismiss,
      icon: Download,
    },
  }[variant]
  const Icon = copy.icon

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-50 px-3 pb-3 sm:px-4 sm:pb-4"
      style={{ animation: 'pwa-banner-in 420ms ease-out' }}
    >
      <div className="mx-auto flex max-w-2xl items-center gap-3 rounded-xl border border-blue-200 bg-white p-3 shadow-lg sm:gap-4 sm:p-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#1877F2] text-white">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-900">{copy.title}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-slate-600 sm:text-sm">{copy.body}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={copy.onAction}
            disabled={busy}
            className="rounded-lg bg-[#1877F2] px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-[#166fe5] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 disabled:opacity-60 sm:text-sm"
          >
            {copy.action}
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
