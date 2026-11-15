import { useEffect, useState } from 'react'
import { apiClient } from '../services/apiClient'

/**
 * The advertisements the newsroom sold itself.
 *
 * Google's auction is asked first, and where it has nothing to show the space is
 * offered to whoever booked it through the advertising desk. This module is the
 * client's copy of that: one request per page load asks the server what is booked
 * into every space on the site, and each `AdSlot` reads its own placement out of
 * the answer.
 *
 * Three things are deliberate:
 *   - the fetch happens once, whatever the number of slots on the page, so an
 *     admin's campaign does not cost five requests;
 *   - a failed or empty answer is not an error state. A space nobody bought is a
 *     space the site sells to itself, which is what `AdSlot` falls back to;
 *   - nothing here is invented. No campaign means no creative, and the placeholder
 *     that takes its place says plainly that the space is for sale.
 */

export const AD_PLACEMENTS = ['nav', 'list', 'articleInline', 'articleSidebar', 'newsRail'] as const
export type AdPlacement = (typeof AD_PLACEMENTS)[number]

export interface AdCampaign {
  id: string
  advertiser: string
  headline: string
  body: string
  ctaLabel: string
  link: string
  image: string
  theme: { bg: string; fg: string; accent: string }
}

type ServerAd = Partial<Omit<AdCampaign, 'id' | 'theme'> & { _id: string; theme: Partial<AdCampaign['theme']> }>

function toCampaign(value: unknown): AdCampaign | null {
  const ad = (value || {}) as ServerAd
  const id = String(ad._id || '')
  const headline = String(ad.headline || '').trim()
  const link = String(ad.link || '').trim()
  // A creative with no words or nowhere to go is not an ad, and an http: link is
  // not one we will send a reader to from a page we serve over https.
  if (!id || !headline || !/^https:\/\//i.test(link)) return null
  return {
    id,
    advertiser: String(ad.advertiser || '').trim(),
    headline,
    body: String(ad.body || '').trim(),
    ctaLabel: String(ad.ctaLabel || '').trim() || 'Learn more',
    link,
    image: String(ad.image || '').trim(),
    theme: {
      bg: String(ad.theme?.bg || '').trim(),
      fg: String(ad.theme?.fg || '').trim(),
      accent: String(ad.theme?.accent || '').trim(),
    },
  }
}

let byPlacement: Partial<Record<AdPlacement, AdCampaign>> = {}
let loaded = false
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((listener) => listener())
}

function fetchAds(): Promise<void> {
  if (!inflight) {
    inflight = apiClient
      .get<{ ads?: Record<string, unknown> }>('/ads', { placement: AD_PLACEMENTS.join(',') })
      .then((response) => {
        const ads = response.data?.data?.ads
        const next: Partial<Record<AdPlacement, AdCampaign>> = {}
        if (ads && typeof ads === 'object') {
          AD_PLACEMENTS.forEach((placement) => {
            const campaign = toCampaign((ads as Record<string, unknown>)[placement])
            if (campaign) next[placement] = campaign
          })
        }
        byPlacement = next
      })
      .catch(() => {
        // No answer is the same as nobody having bought the space. The slots fall
        // back to the house offer and the story page is untouched.
        byPlacement = {}
      })
      .finally(() => {
        loaded = true
        inflight = null
        notify()
      })
  }
  return inflight
}

/** Every booked space, and a re-render when the answer arrives. */
export function useAds(): {
  ads: Partial<Record<AdPlacement, AdCampaign>>
  campaignFor: (placement: string) => AdCampaign | null
  isLoaded: boolean
} {
  const [snapshot, setSnapshot] = useState(byPlacement)

  useEffect(() => {
    const listener = () => setSnapshot(byPlacement)
    listeners.add(listener)
    if (!loaded) void fetchAds()
    return () => {
      listeners.delete(listener)
    }
  }, [])

  return {
    ads: snapshot,
    campaignFor: (placement) => snapshot[placement as AdPlacement] ?? null,
    isLoaded: loaded,
  }
}

/**
 * One counted tap.
 *
 * The reader is already on their way to the advertiser when this fires, so it is
 * fire-and-forget on purpose: a click that never reached our server is a lost
 * number, not a broken page. `keepalive` is what lets it survive the tab losing
 * focus as the new site loads.
 */
export function reportAdClick(id: string): void {
  if (!id) return
  const token = typeof localStorage === 'undefined' ? null : localStorage.getItem('token')
  void fetch(`${apiClient.baseURL}/ads/${encodeURIComponent(id)}/click`, {
    method: 'POST',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  }).catch(() => undefined)
}
