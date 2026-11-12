/**
 * Nothing that watches a reader runs before they say yes.
 *
 * Analytics and advertising are the two things on this site that send a reader's
 * visit to somebody else, so both ask first and remember the answer in this
 * browser. The choice is stored in localStorage, not in a cookie, because this
 * site sets no cookies of its own and the page that explains that should stay
 * telling the truth.
 */
export type ConsentChoice = 'accepted' | 'declined'

const STORAGE_KEY = 'ijwiryukuri-consent'

// A reader who has never been asked has not agreed to anything, so an unset
// choice means the same as a refusal. This is the only safe default when the
// question is "may Google watch this visit".
export function consentChoice(): ConsentChoice | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'accepted' || stored === 'declined' ? stored : null
  } catch {
    // Private mode or a blocked storage area: keep everything switched off.
    return 'declined'
  }
}

export function consentIsSet(): boolean {
  return consentChoice() !== null
}

export function setConsent(choice: ConsentChoice) {
  try {
    localStorage.setItem(STORAGE_KEY, choice)
  } catch {
    // The banner will simply ask again next visit; nothing is sent either way.
  }
  announce()
}

export function forgetConsentChoice() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Already impossible to store, so there is nothing to forget.
  }
  announce()
}

/** True only when the reader said yes and this page is allowed to load Google. */
export function monitoringAllowed(): boolean {
  return consentChoice() === 'accepted'
}

const CHANGED = 'ijwi-consent-changed'

function announce() {
  window.dispatchEvent(new Event(CHANGED))
}

/** Components that already rendered an ad or a script need to hear that the
 *  answer arrived after they mounted. Returns the unsubscribe function. */
export function onConsentChange(listener: () => void) {
  window.addEventListener(CHANGED, listener)
  return () => window.removeEventListener(CHANGED, listener)
}
