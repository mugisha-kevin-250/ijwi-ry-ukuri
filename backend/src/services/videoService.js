/**
 * Turning a link the admin pasted into something safe to put on air.
 *
 * "Play a video on TV" is one sentence, but it arrives at this server as a
 * string, and a string can be a YouTube watch page, a youtu.be short link, a
 * Shorts address, an embed address that already embeds an iframe, a Vimeo page,
 * an mp4 sitting on somebody's server - or a link into this server's own
 * network. So every one of them is read here, and only three shapes are allowed
 * out: a YouTube embed, a Vimeo embed, and a direct video file.
 *
 * Two rules are worth stating because they cost nothing to keep:
 *
 *   - the embed is rebuilt from the video id, never from the text that was
 *     pasted. Whatever else a YouTube URL carried - a playlist, a tracking
 *     parameter, a fragment - it does not reach the reader's page.
 *   - the nocookie player and Vimeo's do-not-track flag are used, because this
 *     is a news site that has not asked its readers for advertising consent on
 *     someone else's behalf.
 *
 * Anything the site has not been told about is refused with a reason, and the
 * admin reads that reason instead of wondering why the screen stayed black.
 */

const { publicHttpsUrl, withHttpsScheme } = require('./urlGuard');

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtube-nocookie.com',
  'youtube-nocookie.com'
]);

const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);

// An eleven-character id is what YouTube actually hands out; anything else in a
// watch address is a path the player would not recognise.
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIDEO_FILE = /\.(mp4|webm|ogv|ogg|m4v|mov)$/i;

function fail(reason) {
  return { ok: false, reason };
}

/**
 * @param {string} value whatever the admin pasted into the box.
 * @returns {{ok: true, source: 'youtube'|'vimeo'|'file', embedUrl: string, watchUrl: string}
 *          | {ok: false, reason: string}}
 */
function describe(value) {
  const guarded = publicHttpsUrl(withHttpsScheme(value));
  if (!guarded.ok) return fail(guarded.reason);
  const parsed = guarded.url;
  const host = parsed.hostname.toLowerCase();
  const path = decodeURIComponent(parsed.pathname).replace(/\/+$/, '');

  if (YOUTUBE_HOSTS.has(host)) {
    let id = '';
    if (host === 'youtu.be') {
      id = path.split('/').filter(Boolean)[0] || '';
    } else if (path.startsWith('/watch')) {
      id = parsed.searchParams.get('v') || '';
    } else if (/^\/(?:embed|shorts|live|v)\/[^/]+/.test(path)) {
      id = path.split('/').filter(Boolean).pop() || '';
    }
    if (!YOUTUBE_ID.test(id)) {
      return fail('that YouTube address does not name a video — it needs a watch, youtu.be, Shorts or live link');
    }
    return {
      ok: true,
      source: 'youtube',
      // Built from the id alone, and served by the player that sets no cookie
      // before anybody presses play.
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`,
      watchUrl: `https://www.youtube.com/watch?v=${id}`
    };
  }

  if (VIMEO_HOSTS.has(host)) {
    const numbers = path.split('/').filter((piece) => /^\d{6,12}$/.test(piece));
    const id = numbers[numbers.length - 1];
    if (!id) return fail('that Vimeo address does not name a video');
    return {
      ok: true,
      source: 'vimeo',
      embedUrl: `https://player.vimeo.com/video/${id}?dnt=1`,
      watchUrl: `https://vimeo.com/${id}`
    };
  }

  if (VIDEO_FILE.test(path)) {
    return { ok: true, source: 'file', embedUrl: parsed.toString(), watchUrl: parsed.toString() };
  }

  return fail('TV plays YouTube and Vimeo links, or the direct address of a .mp4, .webm, .m4v or .ogg file. Nothing else.');
}

module.exports = { describe, YOUTUBE_HOSTS, VIMEO_HOSTS };
