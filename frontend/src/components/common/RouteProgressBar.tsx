import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  currentRequestId,
  hasHeldWork,
  hasReaderWork,
  markReaderAction,
  onProgressChange,
  pendingSince,
  releaseNavigation,
} from '../../utils/apiActivity'

const TICK_MS = 150
// The bar creeps towards this while the page works and only breaks past it when
// everything has actually arrived.
const CEILING = 92
const QUIET_TICKS = 2
// Requests always settle (axios gives up at 30s), so this only exists to catch a
// counted request that never reported back - a cold Render instance can take far
// longer than a page should make a reader watch a full bar.
const MAX_MS = 20000
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
  const run = useRef<{ base: number; startedAt: number; quiet: number; forReader: boolean } | null>(null)
  const timer = useRef(0)
  const hideTimer = useRef(0)
  const revealTimer = useRef(0)

  const tick = useCallback(() => {
    const active = run.current
    if (!active) return
    const idle =
      (active.forReader ? !hasReaderWork() : pendingSince(active.base) === 0 && !hasHeldWork()) &&
      document.readyState === 'complete' &&
      visibleImagesSettled()
    active.quiet = idle ? active.quiet + 1 : 0
    // A slow or dead request must not strand the bar across the top.
    if (active.quiet >= QUIET_TICKS || Date.now() - active.startedAt > MAX_MS) {
      run.current = null
      window.clearInterval(timer.current)
      timer.current = 0
      setDisplay({ value: 100, finishing: true })
      hideTimer.current = window.setTimeout(() => setDisplay(null), 480)
      return
    }
    setDisplay((value) => {
      const current = value?.value ?? CEILING
      return { value: Math.min(CEILING, current + (CEILING - current) * 0.18 + 0.8), finishing: false }
    })
  }, [])

  const start = useCallback(
    (at: number, forReader = false) => {
      window.clearTimeout(hideTimer.current)
      run.current = { base: currentRequestId(), startedAt: Date.now(), quiet: 0, forReader }
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
    const active = run.current
    if (active) {
      active.base = currentRequestId()
      active.startedAt = Date.now()
      active.quiet = 0
      active.forReader = false
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
  // anything, so the request that follows knows somebody is waiting on it.
  useEffect(() => {
    const mark = () => markReaderAction()
    document.addEventListener('pointerdown', mark, true)
    document.addEventListener('keydown', mark, true)
    return () => {
      document.removeEventListener('pointerdown', mark, true)
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
        if (!hasReaderWork()) {
          window.clearTimeout(revealTimer.current)
          revealTimer.current = 0
          return
        }
        // A hold is a page saying out loud that it is waiting, so it is answered
        // at once. A request on its own gets the short grace period an answer
        // that arrives instantly would not have needed a bar for.
        if (hasHeldWork()) {
          start(HELD_START, true)
          return
        }
        if (revealTimer.current !== 0) return
        revealTimer.current = window.setTimeout(() => {
          revealTimer.current = 0
          if (run.current === null && hasReaderWork()) start(HELD_START, true)
        }, REVEAL_MS)
      }),
    [start],
  )

  if (display === null) return null

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[75] h-[3px]"
      style={{ opacity: display.finishing ? 0 : 1, transition: 'opacity 260ms ease-out 200ms' }}
    >
      <div
        className="h-full rounded-r-full bg-[#1877F2]"
        style={{ width: `${display.value}%`, transition: 'width 200ms ease-out', boxShadow: '0 0 10px rgba(24, 119, 242, 0.45)' }}
      />
    </div>
  )
}
