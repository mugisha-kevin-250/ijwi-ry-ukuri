import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  actedRecently,
  clearReaderAction,
  currentRequestId,
  hasHeldWork,
  hasReaderWork,
  heldSince,
  markReaderAction,
  onProgressChange,
  pendingSince,
  readerWorkSince,
  releaseNavigation,
} from '../../utils/apiActivity'

const TICK_MS = 150
// The bar creeps towards this while the page works and only breaks past it when
// everything has actually arrived.
const CEILING = 92
const QUIET_TICKS = 2
// How long one bar is allowed to stay on screen, counted from the moment the
// page it answers appeared. A navigation is capped short - the reader has the
// next page in front of them, and a line that keeps crawling because one
// picture is still coming down reads as a fault, not as news. Work the reader
// is waiting an answer for gets a longer allowance, but only when the press
// that started it is recent: a page chaining its own second fetch, or a request
// the reader has already stopped watching, is answered by the same short cap.
// Nothing on this site - not an upload, not an AI answer - legitimately keeps a
// person looking at a crawling line for longer than these eight seconds, and
// past that the bar would only be reporting a stalled request.
const NAVIGATION_MAX_MS = 1600
const READER_MAX_MS = 8000
// A page asked to be waited for (a city typed at the weather desk) after the
// navigation that opened this bar was long finished.
const HELD_START = 14
// An answer that arrives inside this window was never worth a bar. A press whose
// work outlives it is exactly the wait the reader is looking at.
const REVEAL_MS = 150

// Lazy images far below the fold never start loading, so waiting on every <img>
// in the document would leave the bar stuck just short of finishing.
function visibleImagesSettled(): boolean {
  return Array.from(document.images).every((image) => {
    if (image.complete) return true
    const box = image.getBoundingClientRect()
    return box.bottom < 0 || box.top > window.innerHeight
  })
}

type Display = { value: number; finishing: boolean }

export default function RouteProgressBar() {
  const location = useLocation()
  const route = `${location.pathname}${location.search}`
  const [display, setDisplay] = useState<Display | null>(null)

  // The run the bar is answering: which requests it waits on, when it started,
  // and how many ticks it has had nothing to do. It lives in a ref because the
  // tick loop must not be rebuilt on every repaint of the bar's width.
  // `forReader` is the one exception to counting by navigation: a bar opened by
  // a press waits on the work that press started, however long the page has
  // already been on screen.
  const run = useRef<{ base: number; startedAt: number; quiet: number; forReader: boolean; maxMs: number } | null>(null)
  const timer = useRef(0)
  const hideTimer = useRef(0)
  const revealTimer = useRef(0)
  // Every request at or below this id has already been answered by a bar that
  // finished. The number only ever grows, so it separates the press the reader
  // just made from the work they have already left behind.
  const settledAbove = useRef(0)
  // The request number this page started at, recorded as it arrives. A hold
  // opened at or above it is somebody pressing something on the page they
  // already have; a hold below it is the page loading itself.
  const routeBase = useRef(0)

  const tick = useCallback(() => {
    const active = run.current
    if (!active) return
    const idle =
      (active.forReader ? !hasReaderWork() : pendingSince(active.base) === 0 && !hasHeldWork()) &&
      document.readyState === 'complete' &&
      visibleImagesSettled()
    active.quiet = idle ? active.quiet + 1 : 0
    // Either the work has stopped, or this bar has had the time it is allowed.
    // A page whose third picture is still coming down is a page the reader is
    // already reading; the line is not what they are waiting for any more.
    if (active.quiet >= QUIET_TICKS || Date.now() - active.startedAt > active.maxMs) {
      run.current = null
      window.clearInterval(timer.current)
      timer.current = 0
      // Whatever was in flight when this line ended belonged to the page the
      // reader already has. It is answered by the next press, not by a bar that
      // starts again under a story they are already reading.
      settledAbove.current = currentRequestId()
      setDisplay({ value: 100, finishing: true })
      hideTimer.current = window.setTimeout(() => setDisplay(null), 300)
      return
    }
    setDisplay((value) => {
      const current = value?.value ?? CEILING
      return { value: Math.min(CEILING, current + (CEILING - current) * 0.18 + 0.8), finishing: false }
    })
  }, [])

  const start = useCallback(
    (at: number, kind: 'reader' | 'navigation' = 'navigation') => {
      window.clearTimeout(hideTimer.current)
      run.current = {
        base: currentRequestId(),
        startedAt: Date.now(),
        quiet: 0,
        forReader: kind === 'reader',
        maxMs: kind === 'reader' ? READER_MAX_MS : NAVIGATION_MAX_MS,
      }
      // A line that is still on screen - or still fading out from the wait the
      // reader just watched - keeps where it got to. Dropping a second piece of
      // work back to the left edge read as the page starting over.
      setDisplay((prev) => ({
        value: Math.min(CEILING, prev ? Math.max(at, prev.value) : at),
        finishing: false,
      }))
      window.clearInterval(timer.current)
      timer.current = window.setInterval(tick, TICK_MS)
    },
    [tick],
  )

  useEffect(() => {
    // The page under the bar has changed, so whatever the link press was waiting
    // for has arrived. If that press already opened this bar - which is the
    // ordinary case on a phone, where the line starts under the thumb and the
    // chunk downloads behind it - the climb continues from where it got to and
    // only the ledger of requests it waits on is reset.
    releaseNavigation()
    // Everything this page asked for on its own - its first scoreboard, its
    // first weather read - was opened before this line ran, because a page's
    // effect runs before its parent's. Marking the request number here is what
    // separates that work from a press the reader makes later on the page.
    routeBase.current = currentRequestId()
    // The click that brought this page is finished with. From here the reader
    // is on the new page, and only a press they make on it - not the tap on the
    // link two seconds ago - can make what follows worth a line across the top.
    clearReaderAction()
    const active = run.current
    if (active) {
      active.base = currentRequestId()
      active.startedAt = Date.now()
      active.quiet = 0
      active.forReader = false
      // Whatever is still arriving belongs to the page the reader is now
      // looking at, not to the click that got them there, so this bar gets the
      // short navigation allowance and finishes on its own.
      active.maxMs = NAVIGATION_MAX_MS
    } else {
      start(10)
    }
    return () => {
      run.current = null
      window.clearInterval(timer.current)
      window.clearTimeout(revealTimer.current)
      timer.current = 0
      revealTimer.current = 0
      window.clearTimeout(hideTimer.current)
    }
  }, [route, start])

  // A press, a tap or a keystroke is what makes the work after it worth showing.
  // Recorded on the way in, before any handler has asked the newsroom for
  // anything, so the request that follows knows somebody is waiting on it. The
  // click is listened for as well as the pointer going down, because a control
  // activated from the keyboard - or by a script that fires the click itself -
  // never produces a pointerdown, and the reader waiting on it is just as real.
  useEffect(() => {
    const mark = () => markReaderAction()
    document.addEventListener('pointerdown', mark, true)
    document.addEventListener('click', mark, true)
    document.addEventListener('keydown', mark, true)
    return () => {
      document.removeEventListener('pointerdown', mark, true)
      document.removeEventListener('click', mark, true)
      document.removeEventListener('keydown', mark, true)
    }
  }, [])

  useEffect(
    () =>
      // Background polls deliberately do not open the bar: nobody clicked
      // anything, and a line flashing across the top every half minute reads as
      // a fault rather than as news. Whatever a reader asked for - a button in
      // their library, a chip on the scores page, a city typed at the weather
      // desk - is a different thing, and this is the one place on the site that
      // says so.
      onProgressChange(() => {
        if (run.current !== null) return
        // A hold is a page saying out loud that it is waiting. A hold taken
        // while the page is still arriving is the wait the link press already
        // opened a line for, and that line has its own cap. A hold taken on a
        // page already in front of them - a city typed at the weather desk, a
        // day picked on the scores board, a clip being uploaded - is a question
        // with no other answer coming, and it is only a question because
        // somebody pressed something. Without that last part, a page waiting on
        // itself quietly reopened a line under a story the reader was already
        // reading, which is what made it look like it never finished.
        if (hasHeldWork()) {
          if (heldSince(routeBase.current) && actedRecently()) start(HELD_START, 'reader')
          return
        }
        if (!hasReaderWork()) {
          window.clearTimeout(revealTimer.current)
          revealTimer.current = 0
          return
        }
        // A request on its own gets the short grace period an answer that
        // arrives instantly would not have needed a bar for, and only work
        // begun after the last line finished counts: a picture still coming
        // down under a story the reader is already reading is not a new wait.
        if (revealTimer.current !== 0) return
        revealTimer.current = window.setTimeout(() => {
          revealTimer.current = 0
          if (run.current === null && actedRecently() && readerWorkSince(settledAbove.current)) {
            start(HELD_START, 'reader')
          }
        }, REVEAL_MS)
      }),
    [start],
  )

  if (display === null) return null

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[75] h-[3px]"
      style={{ opacity: display.finishing ? 0 : 1, transition: 'opacity 240ms ease-out' }}
    >
      <div
        className="h-full rounded-r-full bg-[#1877F2]"
        style={{ width: `${display.value}%`, transition: 'width 200ms ease-out', boxShadow: '0 0 10px rgba(24, 119, 242, 0.45)' }}
      />
    </div>
  )
}
