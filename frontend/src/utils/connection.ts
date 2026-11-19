/**
 * Whether this device can reach anything at all.
 *
 * A reader on a Rwandan network loses their connection in the middle of a page
 * all the time, and until now the site answered that with a React error: a
 * request that dies in the wire has no response body, so the message the page
 * printed was "Network Error" or an unrendered object, and a component that
 * trusted the data it asked for crashed the tree.
 *
 * Two things are tracked here, because they are not the same thing. The browser
 * says whether its own radio is on (`navigator.onLine` plus the online/offline
 * events), and the API client says whether a request actually came back. A phone
 * on a captive portal is "online" to the browser and dead to the site, and a
 * reader who has just lost signal must be told the second, not the first.
 *
 * The store is deliberately small and hand-rolled: this is one boolean read by
 * a handful of components, not a state machine, and a page must be able to ask
 * it during a crash before React has finished mounting anything.
 */
type Listener = (offline: boolean) => void

const listeners = new Set<Listener>()

// Starting from "online" is the honest default. `navigator.onLine` is true when
// the browser has no idea (a desktop with a cable, a tester who never went
// offline), and nothing is worse than a strip about a lost connection on a
// reader's first second of a page that has been loading fine.
let offline = typeof navigator === 'undefined' ? false : navigator.onLine === false

function publish() {
  listeners.forEach((listener) => {
    try {
      listener(offline)
    } catch {
      // One broken subscriber must not stop the others from hearing about the
      // connection, and there is nowhere useful to send this error.
    }
  })
}

function setOffline(next: boolean) {
  if (offline === next) return
  offline = next
  publish()
}

let watching = false

function startWatching() {
  if (watching || typeof window === 'undefined') return
  watching = true
  window.addEventListener('offline', () => setOffline(true))
  window.addEventListener('online', () => setOffline(false))
  // The browser only tells us about a radio going off, not about a network that
  // stopped answering, so a request that came back with nothing is the other
  // half of the news. It is cleared by the online event or by the next request
  // that gets any answer at all.
  window.addEventListener('focus', () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) setOffline(true)
  })
}

/** The API client calls this when a request died before it had an answer. */
export function reportRequestFailureWithoutResponse() {
  startWatching()
  setOffline(true)
}

/** And this when any request got any answer, even a 400 - the wire is fine. */
export function reportRequestAnswered() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  setOffline(false)
}

export function isOffline(): boolean {
  startWatching()
  return offline
}

export function onConnectionChange(listener: Listener): () => void {
  startWatching()
  listeners.add(listener)
  listener(offline)
  return () => listeners.delete(listener)
}
