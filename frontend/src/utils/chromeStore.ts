/**
 * The site's own words in the reader's language, kept in this browser.
 *
 * The buttons, the navigation and the section names are a few hundred short
 * strings that change only when the newsroom changes them. Google is paid once
 * for them - on the server, for every reader at once - and the answer is then
 * mirrored here so a second visit in Luganda does not wait for the network
 * before the page makes sense.
 *
 * `stamp` is what makes the cache honest: it is a hash of the English text, so
 * the day a label is reworded in a release, every reader's stored copy is
 * recognized as old and is asked for again instead of being served forever.
 */

const PREFIX = 'radar-chrome-'

function stampOf(strings: Record<string, string>): string {
  const keys = Object.keys(strings).sort()
  let hash = 5381
  for (const key of keys) {
    const text = `${key}\u0000${strings[key]}`
    for (let index = 0; index < text.length; index += 1) {
      hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0
    }
  }
  return `${keys.length}:${(hash >>> 0).toString(36)}`
}

interface Stored {
  stamp: string
  strings: Record<string, string>
}

function storageKey(lang: string): string {
  return `${PREFIX}${lang}`
}

/** The labels for a language, or null when this browser has never had them. */
export function cachedChromeLabels(lang: string, english: Record<string, string>): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(storageKey(lang))
    if (!raw) return null
    const stored = JSON.parse(raw) as Stored
    if (!stored || stored.stamp !== stampOf(english) || !stored.strings) return null
    return stored.strings
  } catch {
    return null
  }
}

export function rememberChromeLabels(lang: string, english: Record<string, string>, strings: Record<string, string>): void {
  try {
    localStorage.setItem(storageKey(lang), JSON.stringify({ stamp: stampOf(english), strings }))
  } catch {
    // A full or private storage is not a reason to stop reading the news; the
    // labels simply get asked for again on the next visit.
  }
}

/** Used when a reader changes language so a stale mirror cannot linger. */
export function forgetChromeLabels(lang: string): void {
  try {
    localStorage.removeItem(storageKey(lang))
  } catch {
    /* nothing stored, nothing to clear */
  }
}
