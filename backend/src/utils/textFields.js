// Everything a reader eventually sees is written through here, so the rules that
// keep a stored value displayable - plain where it has to be plain, bounded in
// size, free of characters that let text render as something it is not - live in
// one place instead of being re-invented in each route.

const INVISIBLE_RANGES = [
  [0x00, 0x08],
  [0x0b, 0x0c],
  [0x0e, 0x1f], // control characters; tab (09) and newline (0a) stay
  [0x7f, 0x9f], // delete and the C1 block
  [0x200b, 0x200f], // zero-width and direction marks
  [0x202a, 0x202e], // bidi embedding and override - how a URL hides its real domain
  [0x2060, 0x2064], // invisible joiners
];

const PLAIN_SPACE = String.fromCharCode(0x20);

function isInvisible(code) {
  if (code === 0xfeff) return true; // byte-order mark
  return INVISIBLE_RANGES.some(([first, last]) => code >= first && code <= last);
}

function stripInvisible(text) {
  let kept = '';
  for (const character of text) {
    const code = character.codePointAt(0);
    if (isInvisible(code)) continue;
    // A non-breaking space looks like a word break and is not one: it survives
    // into a headline and breaks the layout of the card that shows it.
    kept += code === 0xa0 ? PLAIN_SPACE : character;
  }
  return kept;
}

/** Ordinary text: no control characters, no run of blank lines, never longer
 *  than the field can hold. */
function cleanText(value, { maxLength = 2000 } = {}) {
  if (value === undefined || value === null) return '';
  return stripInvisible(String(value))
    .replace(/[^\S\n]+/g, ' ') // any run of spaces, tabs and other blanks -> one space
    .replace(/ \n/g, '\n') // never a trailing space before a line break
    .replace(/\n{3,}/g, '\n\n') // at most one empty line between paragraphs
    .trim()
    .slice(0, maxLength);
}

/** Text that must never carry markup or line breaks: a headline, a name, a
 *  summary line. Tags are removed rather than escaped, because these fields are
 *  read as text everywhere - page titles, meta description, feed entries. */
function plainText(value, { maxLength = 200 } = {}) {
  const withoutTags = String(value === undefined || value === null ? '' : value).replace(/<[^>]*>/g, ' ');
  return cleanText(withoutTags, { maxLength }).replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ');
}

/** Tags are free text from a form field, so they get one rule everywhere:
 *  lower-cased, no leading hash, de-duplicated and few. */
function cleanTags(value, { max = 8, maxLength = 40 } = {}) {
  const list = Array.isArray(value) ? value : String(value === undefined || value === null ? '' : value).split(',');
  const seen = new Set();
  for (const raw of list) {
    const tag = plainText(String(raw).replace(/^#+/, ''), { maxLength }).toLowerCase();
    if (!tag) continue;
    seen.add(tag);
    if (seen.size >= max) break;
  }
  return [...seen];
}

/** An image field is either an absolute URL, a /uploads path from this API, or a
 *  path into the app's own files. Anything else - javascript:, an empty data:
 *  blob, a stray object - is dropped instead of stored. */
function safeMediaUrl(value) {
  const url = String(value === undefined || value === null ? '' : value).trim();
  if (!url) return '';
  if (/^(https?:\/\/|data:image\/|blob:|\/uploads\/|\/[a-z0-9._-])/i.test(url)) return url.slice(0, 500);
  return '';
}

module.exports = { cleanText, plainText, cleanTags, safeMediaUrl };
