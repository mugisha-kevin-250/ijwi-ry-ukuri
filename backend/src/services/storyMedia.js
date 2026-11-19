/**
 * The extra pictures and clips a story carries.
 *
 * A photograph at the top of a story and the one clip under it are the single
 * fields they always were (`featuredImage`, `imageCredit`, `videoUrl`). Most
 * reporting is not one picture, though: a visit has a second room, a protest has
 * a wider shot, and a statement worth playing runs after the one already there.
 * Those travel in `media`, in the order the author put them, each with its own
 * caption and its own credit - because a picture the newsroom did not take has
 * to say so, and a second picture is exactly where that gets forgotten.
 *
 * The rules are the ones the single fields already follow, and they are read
 * from the same places rather than copied:
 *
 * - a video goes through storyVideo, which is the only thing that decides what
 *   address the reader's page may load. `embedUrl` is never what was typed;
 * - an image is either a file this API handed back (`/uploads/...`) or an https
 *   address the address guard accepts, so a story cannot be made to point a
 *   reader's browser at a machine inside the newsroom's own network;
 * - a half-written row is not a lie, so an item with no address is dropped
 *   rather than refused: the author was still filling the form in.
 */

const storyVideo = require('./storyVideo');
const { publicHttpsUrl, withHttpsScheme } = require('./urlGuard');
const { plainText, safeMediaUrl } = require('../utils/textFields');

// A story with forty pictures is a photo album, not a story, and every one of
// them costs the reader a download. The ceiling is generous for a news page and
// small enough that the payload of one story stays a page and not a library.
const MAX_ITEMS = 12;

// The extensions uploadRoutes will accept for an image, so a stored path can
// never name something that is not a picture.
const OWN_IMAGE = /^\/uploads\/[a-z0-9._-]{1,120}\.(?:jpe?g|png|webp|gif)$/i;

function readImage(value) {
  // The scheme is filled in before anything else reads the text, so a host typed
  // straight into the box (`apimg.example.org/a.jpg`) is treated as the https
  // address the author meant, and our own `/uploads/...` path is left alone.
  const url = safeMediaUrl(withHttpsScheme(value));
  if (!url) return { ok: false, reason: 'a picture has to be uploaded or given as an https address' };
  if (OWN_IMAGE.test(url)) return { ok: true, url };
  // An inline picture is a document, not a reference: the whole file would be
  // stored inside the story, and the story is read by everyone who opens the
  // news page. Only a real address or one of our own files is accepted.
  if (/^(data:|blob:)/i.test(url)) {
    return { ok: false, reason: 'the picture has to be uploaded or linked by address, not pasted as text' };
  }
  // Anything that is not our own file has to be a plain public https address.
  const guard = publicHttpsUrl(url);
  if (!guard.ok) return { ok: false, reason: `the picture address is refused - ${guard.reason}` };
  return { ok: true, url };
}

/**
 * @param {unknown} value the `media` the form sent. `undefined` means the field
 *                        was not part of this save, so the story keeps what it
 *                        had; an empty list means "take them all off".
 * @returns {{ok: true, media: Array<object>} | {ok: false, reason: string}}
 */
function normalize(value) {
  if (value === undefined) return { ok: true, untouched: true, media: [] };
  if (value === null) return { ok: true, media: [] };
  if (!Array.isArray(value)) {
    return { ok: false, reason: 'The extra pictures and clips have to be sent as a list.' };
  }
  if (value.length > MAX_ITEMS) {
    return { ok: false, reason: `A story carries up to ${MAX_ITEMS} extra pictures or clips. Remove one and save again.` };
  }

  const media = [];
  for (const raw of value) {
    const item = raw && typeof raw === 'object' ? raw : {};
    const kind = String(item.kind || 'image').trim().toLowerCase();
    if (kind !== 'image' && kind !== 'video') {
      return { ok: false, reason: 'Every item is either a picture or a clip.' };
    }
    const address = String(item.url === undefined || item.url === null ? '' : item.url).trim();
    if (!address) continue;

    const caption = plainText(item.caption, { maxLength: 240 });
    const credit = plainText(item.credit, { maxLength: 160 });

    if (kind === 'video') {
      const read = storyVideo.resolve(address);
      if (!read.ok) return { ok: false, reason: read.reason };
      media.push({
        kind: 'video',
        url: read.fields.videoUrl,
        source: read.fields.videoSource,
        embedUrl: read.fields.videoEmbedUrl,
        caption,
        credit
      });
      continue;
    }

    const read = readImage(address);
    if (!read.ok) return { ok: false, reason: read.reason };
    media.push({ kind: 'image', url: read.url, source: '', embedUrl: read.url, caption, credit });
  }

  return { ok: true, media };
}

module.exports = { normalize, MAX_ITEMS, OWN_IMAGE };
