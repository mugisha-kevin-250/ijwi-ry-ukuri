/**
 * A flag beside a language name.
 *
 * A language does not really belong to a country, so this is a shortcut rather
 * than a claim: the picker has two hundred rows and a reader scanning for
 * Kinyarwanda finds it far faster when the row carries a shape their eye already
 * knows. Where a language is spoken across many countries and picking one would
 * be wrong, the answer is the globe rather than a guess.
 *
 * Three rules decide what a row shows:
 *   - an explicit region in the code wins, so pt-BR is Brazil and pt is Portugal;
 *   - otherwise the principal country of the language, from the table below;
 *   - otherwise nothing that pretends to be certain - a globe.
 */

/** Language code -> the region whose flag stands for it in this list. */
const BY_LANGUAGE: Record<string, string> = {
  af: 'ZA', ak: 'GH', am: 'ET', ar: 'SA', as: 'IN', ay: 'BO', az: 'AZ',
  be: 'BY', bg: 'BG', bho: 'IN', bm: 'ML', bn: 'BD', bo: 'CN', br: 'FR',
  bs: 'BA', ca: 'ES', ceb: 'PH', ckb: 'IQ', co: 'FR', cs: 'CZ', cy: 'GB',
  da: 'DK', de: 'DE', doi: 'IN', dv: 'MV', ee: 'GH', el: 'GR', en: 'GB',
  eo: 'EU', es: 'ES', et: 'EE', eu: 'ES', fa: 'IR', fi: 'FI', fil: 'PH',
  fr: 'FR', fy: 'NL', ga: 'IE', gd: 'GB', gl: 'ES', gu: 'IN', ha: 'NG',
  haw: 'US', he: 'IL', hi: 'IN', hmn: 'LA', hr: 'HR', ht: 'HT', hu: 'HU',
  hy: 'AM', id: 'ID', ig: 'NG', is: 'IS', it: 'IT', ja: 'JP', jv: 'ID',
  ka: 'GE', kk: 'KZ', km: 'KH', kn: 'IN', ko: 'KR', krio: 'SL', ku: 'TR',
  ky: 'KG', la: 'VA', lb: 'LU', lg: 'UG', lij: 'IT', lo: 'LA', lt: 'LT',
  lus: 'IN', lv: 'LV', mai: 'IN', mg: 'MG', mi: 'NZ', mk: 'MK', ml: 'IN',
  mn: 'MN', mni: 'IN', mr: 'IN', ms: 'MY', mt: 'MT', my: 'MM', ne: 'NP',
  nl: 'NL', no: 'NO', nso: 'ZA', ny: 'MW', oci: 'FR', or: 'IN', pa: 'IN',
  pl: 'PL', ps: 'AF', pt: 'PT', qu: 'PE', rm: 'CH', ro: 'RO', ru: 'RU',
  rw: 'RW', sa: 'IN', sd: 'PK', si: 'LK', sk: 'SK', sl: 'SI', sm: 'WS',
  sn: 'ZW', so: 'SO', sq: 'AL', sr: 'RS', st: 'LS', su: 'ID', sv: 'SE',
  sw: 'TZ', ta: 'IN', te: 'IN', tg: 'TJ', th: 'TH', ti: 'ER', tk: 'TM',
  tly: 'TR', tr: 'TR', ts: 'ZA', tt: 'RU', ug: 'CN', uk: 'UA', ur: 'PK',
  uz: 'UZ', ve: 'ZA', vi: 'VN', xh: 'ZA', yi: 'IL', yo: 'NG', yue: 'CN',
  za: 'CN', zh: 'CN', zu: 'ZA',
}

// A handful of codes name a language shared by many countries. Any one flag
// would mislead, so these say what they are: a family of places.
const SHARED_WITH_GLOBE = new Set(['419'])

const IS_REGION = /^[a-z]{2}$/i

function toFlag(region: string): string {
  const letters = region.toUpperCase().slice(0, 2)
  if (!/^[A-Z]{2}$/.test(letters)) return '\u{1F310}'
  // Regional indicator symbols: U+1F1E6 is "A".
  return String.fromCodePoint(...[...letters].map((char) => 0x1f1e6 + (char.charCodeAt(0) - 65)))
}

/** The two-letter region a language code stands for, or null when nothing honest
 *  answers it. Exported for callers that want the code rather than the picture. */
export function regionFor(code: string): string | null {
  const clean = String(code || '').trim().toLowerCase().replace(/_/g, '-')
  if (!clean) return null
  const parts = clean.split('-')
  const base = parts[0]
  const explicit = parts.slice(1).find((part) => IS_REGION.test(part) || SHARED_WITH_GLOBE.has(part))
  if (explicit) return explicit.toUpperCase()
  return BY_LANGUAGE[base] || BY_LANGUAGE[clean] || null
}

/** The picture to put in front of a language name. */
export function flagFor(code: string): string {
  const region = regionFor(code)
  if (!region || SHARED_WITH_GLOBE.has(region)) return '\u{1F310}'
  return toFlag(region)
}
