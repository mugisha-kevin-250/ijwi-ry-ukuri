import { useEffect } from 'react'
import { resolveMediaUrl } from '../services/apiClient'

const SITE_URL = 'https://www.radartimes.2bd.net'
const DEFAULT_TITLE = 'RADAR | Real news, real people, stories shaping Rwanda and the world'
const DEFAULT_DESCRIPTION = 'RADAR - Real news, real people, and stories shaping Rwanda, Africa and the world.'
const DEFAULT_IMAGE = `${SITE_URL}/icons/icon-512x512.png`

function upsertMeta(selector: string, attribute: string, value: string, create: () => HTMLElement) {
  let element = document.head.querySelector<HTMLElement>(selector)
  if (!element) {
    element = create()
    document.head.appendChild(element)
  }
  element.setAttribute(attribute, value)
}

function setMeta(name: string, content: string) {
  upsertMeta(`meta[name="${name}"]`, 'content', content, () => {
    const meta = document.createElement('meta')
    meta.setAttribute('name', name)
    return meta
  })
}

function setProperty(property: string, content: string) {
  upsertMeta(`meta[property="${property}"]`, 'content', content, () => {
    const meta = document.createElement('meta')
    meta.setAttribute('property', property)
    return meta
  })
}

function setCanonical(href: string) {
  upsertMeta('link[rel="canonical"]', 'href', href, () => {
    const link = document.createElement('link')
    link.rel = 'canonical'
    return link
  })
}

export interface SeoOptions {
  title?: string
  description?: string
  path?: string
  image?: string
  type?: 'website' | 'article'
  jsonLd?: Record<string, unknown> | Record<string, unknown>[]
  /**
   * A page that exists for one person and says nothing the public came to read -
   * somebody's own profile before anything is published under their name - should
   * be left out of the index rather than hidden behind a `robots.txt` line, which
   * is also how the rest of the signed-in site is kept out. `noindex, follow` keeps
   * the links on it crawlable, so the stories it points at lose nothing.
   */
  noindex?: boolean
}

export function absoluteSiteUrl(path?: string) {
  if (!path) return `${SITE_URL}/`
  if (/^https?:\/\//.test(path)) return path
  return `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`
}

/** Convert API-relative media paths to public, crawlable image URLs. */
export function absoluteMediaUrl(value?: string | null) {
  const resolved = resolveMediaUrl(value)
  if (!resolved || /^(data:|blob:)/i.test(resolved)) return DEFAULT_IMAGE
  if (/^https?:\/\//i.test(resolved)) return resolved
  return absoluteSiteUrl(resolved.startsWith('/') ? resolved : `/${resolved}`)
}

/**
 * Firebase Hosting serves one static shell, so search results would otherwise
 * show the same title for every route. This keeps the head in step with the
 * rendered page and clears it again on unmount.
 */
export function useSeo({
  title,
  description,
  path,
  image,
  type = 'website',
  jsonLd,
  noindex = false,
}: SeoOptions) {
  const url = absoluteSiteUrl(path)
  const nextTitle = title ? `${title} | RADAR` : DEFAULT_TITLE
  const nextDescription = description || DEFAULT_DESCRIPTION
  const nextImage = image ? absoluteMediaUrl(image) : DEFAULT_IMAGE
  // A page kept out of the index has no business describing itself to one, so the
  // structured data goes away with the index permission rather than alongside it.
  const jsonLdText = jsonLd && !noindex ? JSON.stringify(jsonLd) : ''

  useEffect(() => {
    document.title = nextTitle
    setCanonical(url)
    setMeta('robots', noindex ? 'noindex, follow' : 'index, follow')
    setMeta('description', nextDescription)
    setProperty('og:type', type)
    setProperty('og:title', nextTitle)
    setProperty('og:description', nextDescription)
    setProperty('og:url', url)
    setProperty('og:image', nextImage)
    setMeta('twitter:title', nextTitle)
    setMeta('twitter:description', nextDescription)
    setMeta('twitter:image', nextImage)

    let script: HTMLScriptElement | null = null
    if (jsonLdText) {
      script = document.createElement('script')
      script.type = 'application/ld+json'
      script.dataset.seo = 'route'
      script.textContent = jsonLdText
      document.head.appendChild(script)
    }

    return () => {
      if (script) script.remove()
      document.title = DEFAULT_TITLE
      setCanonical(`${SITE_URL}/`)
      setMeta('robots', 'index, follow')
      setMeta('description', DEFAULT_DESCRIPTION)
      setProperty('og:title', DEFAULT_TITLE)
      setProperty('og:description', DEFAULT_DESCRIPTION)
      setProperty('og:url', `${SITE_URL}/`)
      setProperty('og:type', 'website')
    }
  }, [nextTitle, nextDescription, url, nextImage, type, jsonLdText, noindex])
}

export default useSeo
