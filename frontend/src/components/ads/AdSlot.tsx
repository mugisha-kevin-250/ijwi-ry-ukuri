import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../context/I18nContext'
import { adClient, adsEnabled, adSlotId, loadAdsense } from '../../utils/adsense'
import { monitoringAllowed, onConsentChange } from '../../utils/consent'

/**
 * One AdSense unit, named after where it sits (articleInline, articleSidebar,
 * list...). Until the owner supplies both the client id and that placement's
 * slot id, and until this reader accepts, it renders nothing at all, so the
 * layout never shows an empty box and no ad request leaves the browser first.
 */
export default function AdSlot({ name, className = '' }: { name: string; className?: string }) {
  const { t } = useI18n()
  const slot = adSlotId(name)
  const marker = useRef<HTMLModElement | null>(null)
  const [allowed, setAllowed] = useState(monitoringAllowed)

  useEffect(() => onConsentChange(() => setAllowed(monitoringAllowed())), [])

  const enabled = adsEnabled && Boolean(slot) && allowed

  useEffect(() => {
    if (!enabled || !marker.current) return
    loadAdsense()
    try {
      // AdSense fills the <ins> it finds as soon as its script is ready; a
      // blocked or unsold ad has to leave the story untouched.
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch {
      // AdSense reports its own problems; they are never a story problem.
    }
  }, [enabled])

  if (!enabled) return null

  return (
    <aside className={`notranslate ${className}`}>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('ads.label')}</p>
      <ins
        ref={marker}
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={adClient()}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  )
}
