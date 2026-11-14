/**
 * The one language a reader chose, kept outside React on purpose.
 *
 * Every public story request has to carry it, and the axios client is not a
 * component - so the answer lives here, in one place that both the interface
 * and the network layer can read. localStorage keeps the choice across visits,
 * and `language-chosen` records that somebody actually made it: an older build
 * wrote a default on every load, and that is not a reader's decision.
 */

const LANG_KEY = 'lang'
const CHOSEN_KEY = 'language-chosen'

export const DEFAULT_LANGUAGE = 'en'

const listeners = new Set<() => void>()

function read(): string {
  if (localStorage.getItem(CHOSEN_KEY) !== 'true') return DEFAULT_LANGUAGE
  const stored = (localStorage.getItem(LANG_KEY) || '').trim()
  // A reader who had picked French before keeps French - it is now served by the
  // translator rather than a hand-written dictionary. 'rw' was the old automatic
  // default that nobody ever chose, and it is no longer a language the site
  // writes in, so it falls back to English.
  if (!stored || stored === 'rw') return DEFAULT_LANGUAGE
  return stored
}

let current = read()

export function readerLanguage(): string {
  return current
}

export function languageChosen(): boolean {
  return localStorage.getItem(CHOSEN_KEY) === 'true'
}

export function setReaderLanguage(code: string): void {
  const next = String(code || '').trim() || DEFAULT_LANGUAGE
  if (next === current) return
  current = next
  localStorage.setItem(LANG_KEY, next)
  localStorage.setItem(CHOSEN_KEY, 'true')
  listeners.forEach((notify) => notify())
}

/** Called when a visitor dismisses the chooser without picking anything. */
export function markLanguageAnswered(): void {
  localStorage.setItem(CHOSEN_KEY, 'true')
}

export function subscribeToReaderLanguage(notify: () => void): () => void {
  listeners.add(notify)
  return () => listeners.delete(notify)
}

/** A different tab choosing a language should move this one too. */
window.addEventListener('storage', (event) => {
  if (event.key !== LANG_KEY && event.key !== CHOSEN_KEY) return
  const next = read()
  if (next === current) return
  current = next
  listeners.forEach((notify) => notify())
})
