/**
 * The one rule about fetching an address a stranger typed in.
 *
 * Two endpoints on this server reach out to the internet because someone pasted
 * a link: the photo checker and the broadcast panel. Left unchecked, either one
 * is a door into the server's own network - a link to 127.0.0.1:27017 or to a
 * cloud metadata address would be fetched happily and the answer streamed back.
 *
 * So the same guard is applied before any fetch, from one place, and it refuses
 * anything that is not a plain public https address on an ordinary port. This
 * is a policy rather than a proof; the real protection is that both endpoints
 * sit behind ADMIN.
 */

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^\[?::1\]?$/,
  /^\[?f[cd][0-9a-f]{2}:/i,
  /\.local$/i,
  // `.localhost` is not a real domain - a resolver sends it to the machine doing
  // the asking - and it survives the single-label test above because of the dot.
  /\.localhost$/i,
  /\.internal$/i
];

/**
 * Returns { ok: true, url } or { ok: false, reason } - a reason a person can
 * read, because both callers show it rather than swallowing it.
 */
function publicHttpsUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch {
    return { ok: false, reason: 'that is not a readable address' };
  }
  if (parsed.protocol !== 'https:') return { ok: false, reason: 'only https addresses are fetched' };
  if (parsed.username || parsed.password) return { ok: false, reason: 'the address carries credentials' };
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (!host) return { ok: false, reason: 'the address names no host' };
  // No published photograph and no newsroom video lives on a port, and a port is
  // the easiest way to point this server at something that is not a website.
  if (parsed.port) return { ok: false, reason: 'the address names a port, not a site' };
  // A single-label name ("fileserver") and anything in a private range or a
  // local zone are refused.
  if (!/\./.test(host)) return { ok: false, reason: 'the address names a machine, not a site' };
  if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(host))) {
    return { ok: false, reason: 'that address is inside a private network' };
  }
  return { ok: true, url: parsed };
}

function isPublicHttpsImage(value) {
  return publicHttpsUrl(value);
}

/**
 * Fill in the scheme a pasted link lost on the way here.
 *
 * A phone's share sheet hands over `youtube.com/watch?v=...`, and a chat app
 * strips the protocol on purpose (`//youtu.be/...`). `new URL()` calls both of
 * those garbage, so a perfectly good link is refused as "not a readable
 * address" - which is how a working feature looks broken to the person who
 * typed it. This only ever adds the scheme this site is willing to load; it
 * grants nothing. A bare `127.0.0.1:27017` becomes `https://127.0.0.1:27017`
 * and `publicHttpsUrl` refuses it for naming a private host and a port, exactly
 * as before, and a text that is not an address at all still fails to parse.
 *
 * Callers that paste text from a form use this before the guard. Callers that
 * fetch on behalf of an admin do not, and still take only what they were given.
 */
function withHttpsScheme(value) {
  const text = String(value || '').trim();
  if (!text) return text;
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return text;
  // A single leading slash is not a link missing its scheme, it is a path inside
  // this app - `/uploads/…` from an upload, or a page in the SPA - and turning it
  // into `https://uploads/…` would break the one address format we always accept.
  if (text.startsWith('/') && !text.startsWith('//')) return text;
  return `https://${text.replace(/^\/+/, '')}`;
}

module.exports = { publicHttpsUrl, isPublicHttpsImage, withHttpsScheme };
