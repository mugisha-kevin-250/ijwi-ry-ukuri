/* Service worker for the Ijwi ry'ukuri PWA.
 * Cached data is limited to public news reads, so a signed-in user's private
 * responses are never stored on a shared device.
 *
 * VERSION has to change with every frontend release. The service worker only
 * reinstalls when these bytes differ, and the reinstall is what throws away the
 * cached shell — bump it here (and only here) or returning readers keep serving
 * the previous bundle forever.
 */
const VERSION = 'ijwi-v8'
const SHELL_CACHE = `${VERSION}-shell`
const ASSET_CACHE = `${VERSION}-assets`
const PAGE_CACHE = `${VERSION}-pages`
const DATA_CACHE = `${VERSION}-data`

const SHELL = [
  '/',
  '/index.html',
  '/site.webmanifest',
  '/logo.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
]

// Only these API reads may be cached for offline news.
const CACHEABLE_API = [
  /\/api\/articles(\?|$)/,
  /\/api\/articles\/[a-z0-9-]+(\/|$)/i,
  /\/api\/categories(\?|$)/,
  /\/api\/category\/[a-z0-9-]+/i,
  /\/api\/trending/,
  /\/uploads\//,
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

function isCacheableApi(url) {
  return CACHEABLE_API.some((pattern) => pattern.test(`${url.pathname}${url.search}`))
}

// Signed-in areas must never be cached, otherwise their pages stay readable on a
// shared device after the user goes offline.
const PRIVATE_PATHS = [/^\/mugishaimekevin/, /^\/writer/, /^\/editor/, /^\/user\//, /^\/login/, /^\/register/]

function isPrivate(url) {
  return PRIVATE_PATHS.some((pattern) => pattern.test(url.pathname))
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok) cache.put(request, response.clone())
  return response
}

// Network first keeps news fresh; the cache is what answers when the device is
// offline or Render has spun the free instance down.
async function networkFirst(request, cacheName, fallback) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch (error) {
    const hit = await cache.match(request)
    if (hit) return hit
    if (fallback) {
      const shell = await caches.open(SHELL_CACHE)
      const shellHit = await shell.match(fallback)
      if (shellHit) return shellHit
    }
    throw error
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  const sameOrigin = url.origin === self.location.origin

  if (request.mode === 'navigate') {
    if (isPrivate(url)) return
    event.respondWith(networkFirst(request, PAGE_CACHE, '/index.html'))
    return
  }

  if (sameOrigin && url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, ASSET_CACHE))
    return
  }

  if (isCacheableApi(url)) {
    // Reader-specific flags (liked / following) ride on these reads, so a
    // signed-in response must never reach the offline cache.
    if (request.headers.get('Authorization')) return
    event.respondWith(networkFirst(request, DATA_CACHE))
  }
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch (error) {
    payload = { title: self.location.origin, body: event.data ? event.data.text() : '' }
  }

  const title = payload.title || "Ijwi ry'ukuri"
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      data: { url: payload.url || '/' },
      tag: payload.tag || 'ijwi-news',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(target)
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})
