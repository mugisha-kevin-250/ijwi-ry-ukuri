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

/**
 * Seven seconds of reading before anything is asked.
 *
 * The browser hands over the install event as soon as the page is ready, which
 * used to mean the very first thing a new visitor met was a sheet covering the
 * whole page and stopping the story behind it from scrolling. The owner asked
 * for the opposite: let the reader start reading, then ask, in a card the page
 * stays visible under. Nothing here is timed out - the card is put away by the
 * reader pressing Install or the cross, not by the clock.
 */
const REVEAL_AFTER_MS = 7000

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
  // What wants to be shown, and whether the reader has had their seven seconds.
  // The card is only ever the two of them together, so an install event that
  // arrives early waits, and one that arrives late shows without further delay.
  const [candidate, setCandidate] = useState<Variant>(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    // An installed window cannot install, and a reader who said "not for a week"
    // should not be asked again this visit.
    if (recentlyDismissed() || isWorkspacePath() || isStandalone()) return

    const timer = window.setTimeout(() => setReady(true), REVEAL_AFTER_MS)

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      promptRef.current = event as BeforeInstallPromptEvent
      setCandidate('install')
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)

    // iOS has no install event to wait for, so the manual route is the candidate.
    if (isIosSafari()) setCandidate('ios')

    const onInstalled = () => {
      promptRef.current = null
      setCandidate(null)
    }
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  // No install offer reached this browser - iOS was excluded above, and a
  // desktop that has not fired the event - so the alerts card is what the seven
  // seconds buys instead. Asking for permission when the server cannot deliver
  // anything is noise, so the status call answers first.
  useEffect(() => {
    if (!ready || candidate || promptRef.current) return
    if (!pushSupported()) return
    let alive = true
    void pushAPI
      .getStatus()
      .then((response) => {
        if (alive && response.data.data?.enabled) setCandidate('notifications')
      })
      .catch(() => {
        // Unknown is unanswered, and an unanswered desk is not offered.
      })
    return () => {
      alive = false
    }
  }, [ready, candidate])

  const variant = ready ? candidate : null

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setCandidate(null)
  }

  // Put away for this visit only. The reader minimised the card rather than
  // refusing the app, so the next visit asks again after its seven seconds.
  const close = () => setCandidate(null)

  const install = async () => {
    const deferred = promptRef.current
    if (!deferred) return
    setBusy(true)
    await deferred.prompt()
    const choice = await deferred.userChoice
    promptRef.current = null
    setBusy(false)
    // Accepted: the browser fires `appinstalled` and the card goes by itself.
    // Declined in the browser sheet: no cooldown, so the card simply returns.
    if (choice.outcome !== 'accepted') close()
  }

  const enableUpdates = async () => {
    setBusy(true)
    try {
      await enablePushNotifications()
      setCandidate(null)
    } catch {
      // Denied or unsupported: hide the banner rather than nag on every visit.
      dismiss()
    } finally {
      setBusy(false)
    }
  }

  if (!variant) return null

  const isInstall = variant === 'install'
  const isIos = variant === 'ios'
  const title = isInstall ? t('pwa.installTitle') : isIos ? t('pwa.iosTitle') : t('pwa.updateTitle')
  const body = isInstall ? t('pwa.installBody') : isIos ? t('pwa.iosBody') : t('pwa.updateBody')
  const action = isInstall ? t('pwa.installAction') : isIos ? t('pwa.gotIt') : t('pwa.updateAction')
  const onAction = isInstall ? () => void install() : isIos ? dismiss : () => void enableUpdates()

  return (
    /*
      One card, one line tall, sitting above the phone's bottom bar so it covers
      neither the news nor the way out of the page. The feature list that used to
      justify a full screen is gone; a reader who wants it gets it in the browser
      sheet, which is the thing that actually installs the app.
    */
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-16 z-50 px-3 pb-2 sm:px-4 md:bottom-4"
      style={{ animation: 'pwa-banner-in 420ms ease-out' }}
    >
      <div className="mx-auto flex max-w-2xl items-center gap-3 rounded-xl border border-blue-200 bg-white p-2.5 shadow-lg sm:p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1877F2] text-white">
          {variant === 'notifications' ? <Bell className="h-4 w-4" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold text-slate-900">{title}</p>
          <p className="hidden truncate text-xs text-slate-600 sm:block">{body}</p>
        </div>
        <button
          type="button"
          onClick={onAction}
          disabled={busy}
          className="shrink-0 rounded-lg bg-[#1877F2] px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-[#166fe5] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 disabled:opacity-60 sm:text-sm"
        >
          {action}
        </button>
        <button
          type="button"
          onClick={close}
          aria-label={t('pwa.dismiss')}
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500',
            'transition-colors hover:bg-slate-50 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
          )}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
