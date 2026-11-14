import { useEffect, useState } from 'react'
import { translateAPI, type TranslateLanguage } from '../services/api'

/**
 * The languages a reader can ask for.
 *
 * The list is Google's own, read from the server, so a language the translator
 * adds is a language this site can be read in without a release. It is fetched
 * once per page load and shared by the header picker and the first-visit alert;
 * nobody asks for it twice.
 *
 * English is always offered first and never depends on the network: if the
 * server cannot be reached the picker still has the language the site is
 * written in, and the reader is not asked to choose from an empty list.
 */

const ENGLISH: TranslateLanguage = { code: 'en', name: 'English' }

// The languages a RADAR reader is most likely to want, in the order the picker
// shows them. Anything not in this list is still one keystroke away in the
// search box, which is the point of the whole list.
const NEARBY = [
  'en', 'sw', 'fr', 'rw', 'lg', 'am', 'ar', 'ha', 'yo', 'ig',
  'pt', 'es', 'hi', 'zh-CN', 'de', 'ru', 'tr', 'so', 'my', 'km',
  'ne', 'ur', 'id', 'ms', 'th', 'vi', 'ja', 'ko', 'it', 'nl', 'pl', 'uk',
]

let cached: TranslateLanguage[] | null = null
let inflight: Promise<TranslateLanguage[]> | null = null

function load(): Promise<TranslateLanguage[]> {
  if (cached) return Promise.resolve(cached)
  if (!inflight) {
    inflight = translateAPI
      .getLanguages()
      .then((result) => {
        // A server with no key configured still answers honestly, but an empty
        // list would leave the reader with no way to go back to English.
        cached = result.languages.length ? result.languages : [ENGLISH]
        return cached
      })
      .catch(() => {
        cached = [ENGLISH]
        return cached
      })
  }
  return inflight
}

/** The picker shows these first; every other language is one search away. */
export function nearbyLanguages(all: TranslateLanguage[]): TranslateLanguage[] {
  const byCode = new Map(all.map((item) => [item.code, item]))
  return NEARBY.map((code) => byCode.get(code)).filter((item): item is TranslateLanguage => Boolean(item))
}

export function languageName(all: TranslateLanguage[], code: string): string {
  const wanted = String(code || '').toLowerCase()
  const found = all.find((item) => item.code.toLowerCase() === wanted)
  return found ? found.name : String(code || '')
}

export interface LanguageCatalog {
  languages: TranslateLanguage[]
  nearby: TranslateLanguage[]
  isLoaded: boolean
}

export function useLanguageCatalog(): LanguageCatalog {
  const [languages, setLanguages] = useState<TranslateLanguage[]>(cached || [ENGLISH])
  const [isLoaded, setIsLoaded] = useState(Boolean(cached))

  useEffect(() => {
    if (cached) {
      setLanguages(cached)
      setIsLoaded(true)
      return
    }
    let live = true
    load().then((list) => {
      if (live) {
        setLanguages(list)
        setIsLoaded(true)
      }
    })
    return () => {
      live = false
    }
  }, [])

  return { languages, nearby: nearbyLanguages(languages), isLoaded }
}
