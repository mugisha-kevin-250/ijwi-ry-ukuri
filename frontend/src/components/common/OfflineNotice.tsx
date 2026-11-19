import { useEffect, useState } from 'react'
import { WifiOff, Wifi } from 'lucide-react'
import { onConnectionChange } from '../../utils/connection'
import { useI18n } from '../../context/I18nContext'

/**
 * The one line that tells a reader their network is gone.
 *
 * It is a pill floating above the phone's section bar rather than a strip
 * across the page: the news the reader was already looking at stays exactly
 * where it was, and the sentence only explains why the next page has not come.
 * A reader loses signal on a phone network in the middle of a story constantly,
 * and until now what they saw for it was a React error or a silently empty
 * list.
 *
 * Coming back is announced too, but only for a moment - what is on screen is
 * now stale, so the honest thing is to offer a reload rather than pretend the
 * news refreshed itself.
 */
export default function OfflineNotice() {
  const { t } = useI18n()
  const [offline, setOffline] = useState(false)
  const [justReturned, setJustReturned] = useState(false)

  useEffect(() => {
    let seenOffline = false
    let timer = 0
    const stop = onConnectionChange((next) => {
      setOffline(next)
      if (next) {
        seenOffline = true
        window.clearTimeout(timer)
        setJustReturned(false)
      } else if (seenOffline) {
        setJustReturned(true)
        timer = window.setTimeout(() => setJustReturned(false), 8000)
      }
    })
    return () => {
      window.clearTimeout(timer)
      stop()
    }
  }, [])

  if (!offline && !justReturned) return null

  return (
    <div
      role="status"
      aria-live="polite"
      translate="no"
      className="pointer-events-none fixed inset-x-0 bottom-[74px] z-[74] flex justify-center px-3 md:bottom-6"
    >
      <p
        className={`pointer-events-auto flex max-w-full items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-white shadow-lg ${
          offline ? 'bg-amber-600' : 'bg-emerald-600'
        }`}
      >
        {offline ? <WifiOff className="h-4 w-4 shrink-0" /> : <Wifi className="h-4 w-4 shrink-0" />}
        <span className="truncate">{offline ? t('net.offline') : t('net.reconnected')}</span>
        {!offline && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="shrink-0 rounded-full bg-white/25 px-3 py-1 hover:bg-white/35"
          >
            {t('net.reload')}
          </button>
        )}
      </p>
    </div>
  )
}
