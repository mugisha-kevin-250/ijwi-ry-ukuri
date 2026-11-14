import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Live } from '../../types'
import { liveAPI } from '../../services/api'
import { useI18n } from '../../context/I18nContext'
import { cn } from '../../utils/cn'

const POLL_MS = 20000

// The button has to know about a broadcast that started after the page loaded,
// so it asks the API for the current live on a timer while the tab is visible.
export default function LiveButton({ className }: { className?: string }) {
  const { t } = useI18n()
  const [live, setLive] = useState<Live | null>(null)

  useEffect(() => {
    let active = true
    // The first read always runs; a background tab still has to paint the right
    // state the moment it is opened.
    const fetchCurrent = async (skipGuard = false) => {
      if (!skipGuard && document.hidden) return
      try {
        const response = await liveAPI.getCurrent()
        if (active) setLive(response.data.data.live ?? null)
      } catch {
        // Keep the last known state: a hiccup should not un-blink an on-air badge.
      }
    }
    void fetchCurrent(true)
    const timer = window.setInterval(() => void fetchCurrent(), POLL_MS)
    const onVisible = () => {
      if (!document.hidden) void fetchCurrent()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const isOnAir = live?.status === 'active'

  return (
    <Link
      to="/live"
      aria-label={isOnAir ? `${t('nav.tv')} — ${t('live.onAirNow')}` : t('nav.tv')}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white transition hover:bg-red-700 sm:text-xs',
        isOnAir && 'animate-pulse shadow-[0_0_0_3px_rgba(239,68,68,0.3)]',
        className,
      )}
    >
      {/* Two letters and one dot. The icon that used to sit here cost the
          masthead row more room than the word it spelled, and the dot already
          says what the picture said. */}
      <span className="relative flex h-2 w-2" aria-hidden="true">
        {isOnAir && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />}
        <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
      </span>
      {t('nav.tv')}
    </Link>
  )
}
