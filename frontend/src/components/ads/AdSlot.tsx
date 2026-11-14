import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../context/I18nContext'
import AdvertiseWithUs from './AdvertiseWithUs'
import type { Shape } from './AdvertiseWithUs'
import { adClient, adsEnabled, adSlotId, loadAdsense } from '../../utils/adsense'
import { monitoringAllowed, onConsentChange } from '../../utils/consent'

/**
 * One advertising space.
 *
 * What sits in it depends on who has paid for it. If the owner has supplied both
 * the AdSense client id and this placement's slot id, and this reader has agreed
 * to personalised monitoring, the space is offered to Google's auction - and if
 * the auction comes back with nothing to show, `data-ad-status` says so on the
 * element and the newsroom sells the space to itself instead, because a reader
 * scrolling past a hole is worse for everyone than a reader seeing our own offer.
 *
 * With no ids configured, or with the reader's consent withheld, no ad request
 * leaves the browser at all and the house offer is what is printed. The slot is
 * never left blank, and it is never a fake ad: it says it is an advertisement
 * whichever way it is filled.
 */

// The shape each placement reserves, so the page does not jump when a real
// advertiser takes over the space.
const SHAPE_BY_PLACEMENT: Record<string, Shape> = {
  leaderboard: 'banner',
  list: 'banner',
  articleInline: 'banner',
  articleSidebar: 'rail',
  newsRail: 'rail',
}

interface AdSlotProps {
  /** Which placement this is, as named in the AdSense console. */
  name: string
  /** Override the reserved shape when a page wants a different one. */
  shape?: Shape
  className?: string
}

export default function AdSlot({ name, shape, className = '' }: AdSlotProps) {
  const { t } = useI18n()
  const slot = adSlotId(name)
  const marker = useRef<HTMLModElement | null>(null)
  const [allowed, setAllowed] = useState(monitoringAllowed)
  const [unsold, setUnsold] = useState(false)

  useEffect(() => onConsentChange(() => setAllowed(monitoringAllowed())), [])

  const enabled = adsEnabled && Boolean(slot) && allowed
  const reserved = shape ?? SHAPE_BY_PLACEMENT[name] ?? 'banner'

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

  // Give the auction its few seconds, then read what it decided. Anything under
  // ten pixels tall is a unit that never got a creative, and a unit that says
  // "unavailable" has already said it in as many words.
  useEffect(() => {
    if (!enabled) {
      setUnsold(false)
      return
    }
    const timer = window.setTimeout(() => {
      const element = marker.current
      if (!element) return
      const status = element.getAttribute('data-ad-status')
      setUnsold(status === 'unavailable' || element.getBoundingClientRect().height < 10)
    }, 4000)
    return () => window.clearTimeout(timer)
  }, [enabled])

  // The placement's own margins belong to this wrapper, never to the creative,
  // so the card keeps its shape wherever a page puts it.
  if (!enabled) {
    return (
      <div className={className}>
        <AdvertiseWithUs shape={reserved} />
      </div>
    )
  }

  return (
    <div className={className}>
      <aside className="notranslate">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('ads.label')}</p>
        <ins
          ref={marker}
          className={unsold ? 'hidden' : 'adsbygoogle'}
          style={{ display: 'block' }}
          data-ad-client={adClient()}
          data-ad-slot={slot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
        {unsold && <AdvertiseWithUs shape={reserved} />}
      </aside>
    </div>
  )
}
