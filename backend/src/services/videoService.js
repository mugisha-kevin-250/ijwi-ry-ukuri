/**
 * Turning a link the admin pasted into something safe to put on air.
 *
 * "Play a video on TV" is one sentence, but it arrives at this server as a
 * string, and a string can be a YouTube watch page, a youtu.be short link, a
 * Shorts address, an embed address that already embeds an iframe, a Vimeo page,
 * a Facebook watch or reel link, an Instagram post, a TikTok video, an mp4
 * sitting on somebody's server - or a link into this server's own network. So
 * every one of them is read here, and only these shapes are allowed out: a
 * YouTube embed, a Vimeo embed, a Facebook plugin, an Instagram embed, a TikTok
 * embed, and a direct video file.
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

// The three platforms a reader here actually shares news from. Their embed
// addresses are public and need no app id, so the video can play inside the
// story instead of only being linked.
const FACEBOOK_HOSTS = new Set([
  'facebook.com',
  'www.facebook.com',
  'm.facebook.com',
  'web.facebook.com',
  'fb.com',
  'video.facebook.com'
]);
const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com']);
const TIKTOK_HOSTS = new Set(['tiktok.com', 'www.tiktok.com']);

// An eleven-character id is what YouTube actually hands out; anything else in a
// watch address is a path the player would not recognise.
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIDEO_FILE = /\.(mp4|webm|ogv|ogg|m4v|mov)$/i;
// Facebook and TikTok number their videos, Instagram labels them with a short
// code. A run of digits that is far too long to be a video id is not one either.
const NUMERIC_ID = /^\d{6,25}$/;
const INSTAGRAM_CODE = /^[A-Za-z0-9_-]{5,20}$/;

function fail(reason) {
  return { ok: false, reason };
}

/** Every path segment that could be a video number, in the order they appear. */
function numbersIn(path) {
  return path.split('/').filter((piece) => NUMERIC_ID.test(piece));
}

/** The first value that is actually an id, or nothing. */
function firstId(candidates) {
  for (const value of candidates) {
    if (typeof value === 'string' && NUMERIC_ID.test(value)) return value;
  }
  return '';
}

/**
 * @param {string} value whatever the admin pasted into the box.
 * @returns {{ok: true, source: 'youtube'|'vimeo'|'facebook'|'instagram'|'tiktok'|'file', embedUrl: string, watchUrl: string}
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

  // Facebook: the number is what the plugin player wants, and it is taken from
  // the address rather than from any text around it. watch/?v=, story.php?video_id=
  // and a /videos/ or /reel/ path all name the same clip.
  if (FACEBOOK_HOSTS.has(host)) {
    const id = firstId([parsed.searchParams.get('v'), parsed.searchParams.get('video_id'), numbersIn(path).pop()]);
    if (!id) return fail('that Facebook address does not name a video - use the watch, reel or videos link of the clip itself');
    // Rebuilt from the id, and pointed at the plugin player, which is the only
    // Facebook address that will load inside another site's page.
    const watchUrl = `https://www.facebook.com/watch/?v=${id}`;
    return {
      ok: true,
      source: 'facebook',
      embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(watchUrl)}&show_text=false&adaptive_width=1`,
      watchUrl
    };
  }

  if (INSTAGRAM_HOSTS.has(host)) {
    const pieces = path.split('/').filter(Boolean);
    const kind = pieces[0] === 'reels' ? 'reel' : pieces[0];
    const code = pieces[1] || '';
    if ((kind === 'p' || kind === 'reel' || kind === 'tv') && INSTAGRAM_CODE.test(code)) {
      const watchUrl = kind === 'p' ? `https://www.instagram.com/p/${code}/` : `https://www.instagram.com/${kind}/${code}/`;
      return { ok: true, source: 'instagram', embedUrl: `${watchUrl.replace(/\/$/, '')}/embed/`, watchUrl };
    }
    return fail('an Instagram address has to be the link of one post or reel');
  }

  if (TIKTOK_HOSTS.has(host)) {
    const id = numbersIn(path).pop();
    if (!id) return fail('a TikTok address has to be the @user/video/ address, not a shared vm.tiktok link');
    return { ok: true, source: 'tiktok', embedUrl: `https://www.tiktok.com/embed/v2/${id}`, watchUrl: parsed.toString() };
  }

  if (VIDEO_FILE.test(path)) {
    return { ok: true, source: 'file', embedUrl: parsed.toString(), watchUrl: parsed.toString() };
  }

  return fail('the players here are YouTube, Vimeo, Facebook, Instagram and TikTok, or the direct address of a .mp4, .webm, .m4v or .ogg file');
}

module.exports = { describe, YOUTUBE_HOSTS, VIMEO_HOSTS };
