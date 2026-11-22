/**
 * The two field checks the alert preferences share.
 *
 * A reader's desk choices and their language choice come from a form, and both
 * end up in a mail that goes out under the newsroom's name, so neither is
 * allowed to arrive as whatever the browser sent. Slugs go into the stop-link
 * query string and into a filter, and a language code selects a sentence from a
 * table - which means a value that is not on that table is not a language, it is
 * a bug or an attempt.
 */

// Category slugs are lowercase words and dashes. Cap the list: somebody who
// ticks every desk is better served by the empty choice, and a form that posts
// four hundred values is not a reader.
const SECTION_MAX = 30;
const SECTION_SHAPE = /^[a-z0-9][a-z0-9-]{0,59}$/;

/**
 * A list of slugs, or null when no list was sent.
 *
 * An empty array is kept as an empty array because it means something the
 * caller chose: "the whole newsroom". Nothing sent at all means "leave whatever
 * this address already decided alone", and the two must not be confused.
 */
function cleanList(value) {
  if (!Array.isArray(value)) return null;
  const seen = new Set();
  for (const item of value.slice(0, SECTION_MAX)) {
    const slug = String(item ?? '').trim().toLowerCase();
    if (SECTION_SHAPE.test(slug)) seen.add(slug);
  }
  return [...seen];
}

/**
 * A language the mailer actually has words for, or null.
 *
 * The list is the mailer's own, so a preference screen can never offer an
 * alert in a language that would silently fall back to English and leave the
 * reader wondering why their choice did nothing.
 */
function oneOrNothing(value, allowed) {
  const code = String(value ?? '').trim().toLowerCase().slice(0, 8);
  if (!code) return null;
  return allowed.includes(code) ? code : null;
}

module.exports = { cleanList, oneOrNothing, SECTION_SHAPE, SECTION_MAX };
