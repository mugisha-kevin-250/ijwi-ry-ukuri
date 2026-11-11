const CLIENT = String(import.meta.env.VITE_ADSENSE_CLIENT || '').trim()

declare global {
  interface Window {
    adsbygoogle?: unknown[]
  }
}

/**
 * No AdSense id in the build environment means no Google script and no
 * placeholder boxes: the site stays exactly as it is today until the owner
 * turns advertising on.
 */
export const adsEnabled = Boolean(CLIENT)

export function adClient(): string {
  return CLIENT
}

let loaded = false

export function loadAdsense() {
  if (!adsEnabled || loaded) return
  loaded = true
  const script = document.createElement('script')
  script.async = true
  script.crossOrigin = 'anonymous'
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`
  document.head.appendChild(script)
}

/** Slot ids are per placement, so the owner creates them in the AdSense console
 *  and names them here; a placement without an id simply stays empty. */
export function adSlotId(name: string): string {
  const key = `VITE_ADSENSE_SLOT_${name.replace(/[^A-Za-z0-9]/g, '').toUpperCase()}`
  return String(import.meta.env[key] || '').trim()
}
