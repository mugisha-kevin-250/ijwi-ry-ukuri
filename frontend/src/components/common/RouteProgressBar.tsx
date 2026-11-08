import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { currentRequestId, pendingSince } from '../../utils/apiActivity'

const TICK_MS = 150
// The bar creeps towards this while the page works and only breaks past it when
// everything has actually arrived.
const CEILING = 92
const QUIET_TICKS = 2
const MAX_MS = 8000

// Lazy images far below the fold never start loading, so waiting on every <img>
// in the document would leave the bar stuck just short of finishing.
function visibleImagesSettled(): boolean {
  return Array.from(document.images).every((image) => {
    if (image.complete) return true
    const box = image.getBoundingClientRect()
    return box.bottom < 0 || box.top > window.innerHeight
  })
}

export default function RouteProgressBar() {
  const location = useLocation()
  const route = `${location.pathname}${location.search}`
  const [progress, setProgress] = useState<number | null>(null)
  const [finishing, setFinishing] = useState(false)

  useEffect(() => {
    const base = currentRequestId()
    const startedAt = Date.now()
    let quietTicks = 0
    let settled = false
    let timer = 0

    const finish = () => {
      if (settled) return
      settled = true
      window.clearInterval(timer)
      setProgress(100)
      setFinishing(true)
    }

    setProgress(10)
    setFinishing(false)

    timer = window.setInterval(() => {
      if (pendingSince(base) === 0 && document.readyState === 'complete' && visibleImagesSettled()) {
        quietTicks += 1
      } else {
        quietTicks = 0
      }
      // A slow or dead request must not strand the bar across the top.
      if (quietTicks >= QUIET_TICKS || Date.now() - startedAt > MAX_MS) {
        finish()
        return
      }
      setProgress((value) => {
        const current = value ?? CEILING
        return Math.min(CEILING, current + (CEILING - current) * 0.18 + 0.8)
      })
    }, TICK_MS)

    return () => {
      settled = true
      window.clearInterval(timer)
    }
  }, [route])

  useEffect(() => {
    if (!finishing) return undefined
    const hide = window.setTimeout(() => setProgress(null), 480)
    return () => window.clearTimeout(hide)
  }, [finishing])

  if (progress === null) return null

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[75] h-[3px]"
      style={{ opacity: finishing ? 0 : 1, transition: 'opacity 260ms ease-out 200ms' }}
    >
      <div
        className="h-full rounded-r-full bg-[#1877F2]"
        style={{ width: `${progress}%`, transition: 'width 200ms ease-out', boxShadow: '0 0 10px rgba(24, 119, 242, 0.45)' }}
      />
    </div>
  )
}
