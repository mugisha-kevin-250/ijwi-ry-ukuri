// Every API call gets a monotonic id so the route loader can tell apart work
// this navigation started and a background poll that was already in flight when
// the link was clicked - only the first one may keep the bar moving.
//
// Each request also remembers whether a reader pressed something just before it
// started. That is what lets one bar across the top of the site answer a
// "delete", a "save" or a "go" without every page drawing a spinner of its own,
// while the scores poll and the session refresh keep working in silence.
let nextId = 1
const active = new Map<number, boolean>()

// A request opened this long after a press, tap or keystroke is taken to be the
// answer to it. Two seconds is generous: a click handler that awaits something
// small before it asks the newsroom still counts, and a poll is minutes away.
const INPUT_WINDOW_MS = 2000
let lastInputAt = 0

// A navigation is not the only thing a reader waits for. Someone who types a
// city into the weather desk, or presses "load more", is waiting between two
// pages that are already loaded, and the one bar across the top of the site is
// what answers them: a page takes a hold here instead of drawing a spinner of
// its own, and releases it when the answer is on screen.
//
// A hold also remembers the request number it was opened under, which is what
// lets the bar tell "the page asked to be waited for when it first loaded" from
// "somebody on this page pressed something". Children run their effects before
// their parents, so a page's own first-load hold is always stamped below the
// route marker the progress bar writes when the page appears.
let nextHoldId = 1
const held = new Map<number, number>()

// The bar is the only progress indicator on this site, so it has to be awake
// when a hold opens without a navigation to carry it.
const watchers = new Set<() => void>()

function notify(): void {
  for (const watch of [...watchers]) watch()
}

/** Say that a reader just acted, so the work that follows is theirs to wait on. */
export function markReaderAction(): void {
  lastInputAt = Date.now()
}

/**
 * Say that the press the reader made has been answered - the page it opened is
 * now in front of them.
 *
 * The progress bar calls this as a new page appears. Without it, the click on
 * the link is still "a press" for the next two seconds, so every request the
 * arriving page makes looks like something the reader is waiting an answer for,
 * and the line that was supposed to finish with the navigation is handed the
 * long allowance instead. A press on the page the reader already has - a button
 * in their library, a city typed at the weather desk, a clip chosen for upload
 * - re-stamps it.
 */
export function clearReaderAction(): void {
  lastInputAt = 0
}

/**
 * Did somebody press, type or tap in the last `windowMs` milliseconds?
 *
 * The progress bar asks this before it treats a page's request as something the
 * reader is waiting an answer for. A page that chains its own second fetch -
 * the comments under a story, the table behind a match panel, the boarding
 * pass a weather desk reads for the first time - opens a hold with nobody
 * having touched anything, and giving that the long allowance is what made the
 * line crawl across a page the reader had already reached.
 */
export function actedRecently(windowMs = INPUT_WINDOW_MS): boolean {
  return lastInputAt !== 0 && Date.now() - lastInputAt < windowMs
}

export function beginRequest(): number {
  const id = nextId
  nextId += 1
  active.set(id, Date.now() - lastInputAt < INPUT_WINDOW_MS)
  notify()
  return id
}

export function endRequest(id: number | undefined): void {
  if (id === undefined) return
  if (active.delete(id)) notify()
}

export function currentRequestId(): number {
  return nextId
}

export function pendingSince(base: number): number {
  let count = 0
  for (const id of active.keys()) {
    if (id >= base) count += 1
  }
  return count
}

/**
 * Ask for the top bar until the returned function is called.
 *
 * The release is idempotent, because the caller's `finally` and the caller's
 * unmount cleanup can both reach for it. Nothing here assumes the work
 * succeeded - it assumes only that the page said when it stopped waiting.
 */
export function holdProgress(): () => void {
  const id = nextHoldId
  nextHoldId += 1
  held.set(id, nextId)
  notify()
  let released = false
  return () => {
    if (released) return
    released = true
    held.delete(id)
    notify()
  }
}

export function hasHeldWork(): boolean {
  return held.size > 0
}

/**
 * Is any page waiting on something asked for at or after `base`?
 *
 * The progress bar uses this to keep a page's own first-load hold inside the
 * navigation that brought the page - the line for that already ran and ended -
 * while still answering the reader who pressed something on a page that is
 * already in front of them.
 */
export function heldSince(base: number): boolean {
  for (const openedAt of held.values()) {
    if (openedAt >= base) return true
  }
  return false
}

/**
 * The bar a link press opens before the next page has been fetched.
 *
 * A click is the moment the reader decided to wait, so the line starts there and
 * not when the new page happens to arrive. Whoever opens it - the link handler -
 * is not whoever closes it: the progress bar releases it as soon as the address
 * in the bar has changed under it.
 *
 * The expiry is short on purpose. A tap on a link that turns out not to
 * navigate - a menu that closes, a chip that is already the current page, a
 * swipe that never became a click - must not leave a full line hanging across
 * the top of a page that has nothing loading on it. One second is long enough
 * for a real navigation to begin and short enough that a false one is over
 * before the reader has wondered about it.
 */
let navigationHold: (() => void) | null = null
let navigationTimer = 0
const NAVIGATION_HOLD_MAX_MS = 1200

export function holdNavigation(): void {
  if (navigationHold) return
  navigationHold = holdProgress()
  navigationTimer = window.setTimeout(releaseNavigation, NAVIGATION_HOLD_MAX_MS)
}

export function releaseNavigation(): void {
  window.clearTimeout(navigationTimer)
  navigationTimer = 0
  navigationHold?.()
  navigationHold = null
}

/** Anything on this page that a reader is entitled to see an answer to. */
export function hasReaderWork(): boolean {
  if (held.size > 0) return true
  for (const byReader of active.values()) {
    if (byReader) return true
  }
  return false
}

/**
 * Reader-flagged work that started at or after `base`.
 *
 * `hasReaderWork` on its own cannot tell a new press from an old one: a picture
 * that is still coming down on a page the reader already reached is reader work,
 * and answering it with a fresh bar is exactly the line that never finishes.
 * Asking for work started after a point the caller remembers separates the
 * request the reader just made from the ones they have already left behind.
 */
export function readerWorkSince(base: number): boolean {
  for (const [id, byReader] of active) {
    if (id >= base && byReader) return true
  }
  return false
}

export function onProgressChange(watch: () => void): () => void {
  watchers.add(watch)
  return () => {
    watchers.delete(watch)
  }
}
