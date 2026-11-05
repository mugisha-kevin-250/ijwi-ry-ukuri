import { useEffect } from 'react'

const SITE_URL = 'https://ijwi-ry--ukuri.web.app'
const DEFAULT_TITLE = "Ijwi ry'ukuri | Inkuru nyayo, abantu nyabo"
const DEFAULT_DESCRIPTION = "Ijwi ry'ukuri - Real news, real people, and stories shaping Rwanda."
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
  jsonLd?: Record<string, unknown>
}

export function absoluteSiteUrl(path?: string) {
  if (!path) return `${SITE_URL}/`
  if (/^https?:\/\//.test(path)) return path
  return `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`
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
}: SeoOptions) {
  const url = absoluteSiteUrl(path)
  const nextTitle = title ? `${title} | Ijwi ry'ukuri` : DEFAULT_TITLE
  const nextDescription = description || DEFAULT_DESCRIPTION
  const nextImage = image || DEFAULT_IMAGE
  const jsonLdText = jsonLd ? JSON.stringify(jsonLd) : ''

  useEffect(() => {
    document.title = nextTitle
    setCanonical(url)
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
      setMeta('description', DEFAULT_DESCRIPTION)
      setProperty('og:title', DEFAULT_TITLE)
      setProperty('og:description', DEFAULT_DESCRIPTION)
      setProperty('og:url', `${SITE_URL}/`)
      setProperty('og:type', 'website')
    }
  }, [nextTitle, nextDescription, url, nextImage, type, jsonLdText])
}

export default useSeo
