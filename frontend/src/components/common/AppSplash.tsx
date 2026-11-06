import { useEffect, useState } from 'react'
import { useI18n } from '../../context/I18nContext'

const MIN_VISIBLE_MS = 900
const MAX_VISIBLE_MS = 6000

// The splash covers the first paint; it must never gate the site, so anything still
// in flight at MAX_VISIBLE_MS is skipped rather than keeping the reader waiting.
function imagesSettled() {
  return Array.from(document.images).every((image) => image.complete)
}

export default function AppSplash() {
  const { t } = useI18n()
  const [leaving, setLeaving] = useState(false)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const startedAt = Date.now()
    let finished = false

    const finish = () => {
      if (finished) return
      finished = true
      setLeaving(true)
      window.setTimeout(() => setHidden(true), 450)
    }

    const tick = window.setInterval(() => {
      const elapsed = Date.now() - startedAt
      if (elapsed < MIN_VISIBLE_MS) return
      if ((document.readyState === 'complete' && imagesSettled()) || elapsed >= MAX_VISIBLE_MS) finish()
    }, 150)

    return () => window.clearInterval(tick)
  }, [])

  if (hidden) return null

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={t('splash.aria')}
      className={`fixed inset-0 z-[80] flex flex-col items-center justify-center gap-4 bg-white px-6 transition-opacity duration-[450ms] ease-out ${
        leaving ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <img
        src="/icons/icon-192x192.png"
        alt=""
        className="h-20 w-20 rounded-2xl object-contain"
        onError={(event) => {
          event.currentTarget.src = '/favicon.svg'
        }}
      />
      <p className="text-2xl font-extrabold tracking-tight text-[#1877F2]">Ijwi ry'ukuri</p>
      <p className="max-w-xs text-center text-sm leading-relaxed text-slate-600">{t('splash.welcome')}</p>
      <span className="mt-2 h-1 w-40 overflow-hidden rounded-full bg-blue-100">
        <span className="app-splash-bar block h-full w-1/2 rounded-full bg-[#1877F2]" aria-hidden="true" />
      </span>
    </div>
  )
}
