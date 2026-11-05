// PWA entry point: installs the service worker that powers offline news and
// push notifications. Safe to call more than once.
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    registration.addEventListener('updatefound', () => {
      const nextWorker = registration.installing
      if (!nextWorker) return
      nextWorker.addEventListener('statechange', () => {
        if (nextWorker.state === 'installed' && navigator.serviceWorker.controller) {
          window.dispatchEvent(new CustomEvent('pwa:update-available'))
        }
      })
    })
    return registration
  } catch (error) {
    console.warn('Service worker registration failed:', error)
    return null
  }
}

export async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  // getRegistration() takes a scope, not the script URL.
  const existing = await navigator.serviceWorker.getRegistration('/')
  return existing ?? await registerServiceWorker()
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS exposes the flag on the navigator object instead of the media query.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}
