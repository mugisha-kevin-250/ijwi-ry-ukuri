const MEASUREMENT_ID = String(import.meta.env.VITE_GA_MEASUREMENT_ID || '').trim()

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

/**
 * Google Analytics stays completely switched off until the owner puts a
 * measurement id in the build environment, so nothing is sent anywhere and no
 * third-party script is loaded for a reader on our own initiative.
 */
export const analyticsEnabled = Boolean(MEASUREMENT_ID)

let started = false

function start() {
  if (started) return
  started = true
  window.dataLayer = window.dataLayer || []
  window.gtag = window.gtag || function gtag(...args: unknown[]) {
    window.dataLayer?.push(args)
  }
  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`
  document.head.appendChild(script)
  window.gtag('js', new Date())
  // Pages report their own view below, which keeps SPA route changes counted
  // once each instead of Google guessing from full reloads.
  window.gtag('config', MEASUREMENT_ID, { send_page_view: false })
}

export function trackPageView(path: string) {
  if (!analyticsEnabled) return
  start()
  window.gtag?.('event', 'page_view', {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  })
}

export function trackEvent(name: string, params: Record<string, string | number | boolean> = {}) {
  if (!analyticsEnabled) return
  start()
  window.gtag?.('event', name, params)
}
