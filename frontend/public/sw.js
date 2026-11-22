/* Service worker for the RADAR PWA.
 * Cached data is limited to public news reads, so a signed-in user's private
 * responses are never stored on a shared device.
 *
 * VERSION has to change with every frontend release. The service worker only
 * reinstalls when these bytes differ, and the reinstall is what throws away the
 * cached shell — bump it here (and only here) or returning readers keep serving
 * the previous bundle forever.
 */
const VERSION = 'radar-v49'
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
  /\/api\/sections(\?|$)/,
  /\/api\/sections\/[a-z0-9-]+(\/[a-z0-9-]+)?/i,
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
    payload = { title: '', body: event.data ? event.data.text() : '' }
  }

  const title = String(payload.title || '').trim()
  const body = String(payload.body || '').trim()

  // A push that carries nothing to say is not a notification. It is the server
  // reaching the device, and the honest answer is to stay quiet rather than put
  // a blank row on a phone's shelf that the reader has to work out how to read.
  if (!title && !body) return

  const options = {
    body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    data: { url: payload.url || '/' },
    tag: payload.tag || 'radar-news',
    // Stories pile up on a phone that got four of them while it was in a pocket.
    // A group folds them into one row the reader opens once.
    group: payload.group || 'radar-news',
    // The moment it happened, not the moment the network got round to it, which
    // is what makes the shelf sort itself correctly after a reconnect.
    timestamp: Number(payload.timestamp) || Date.now(),
  }

  // Quiet is decided per device by the reader, and per bulletin by whoever sent
  // it. Either one is enough to suppress the sound; neither suppresses the news.
  if (payload.silent === true) options.silent = true

  // Kept on screen until it is dealt with, for the bulletins the newsroom marked
  // as something a reader should not scroll past. Android ignores this and shows
  // the alert in its usual place instead, which is still the alert.
  options.requireInteraction = payload.requireInteraction === true

  event.waitUntil(self.registration.showNotification(title || 'RADAR', options))
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
