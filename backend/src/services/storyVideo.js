/**
 * The video an author attaches to a story, read the same way the TV panel reads
 * a link.
 *
 * A story carries one video the newsroom itself attached, and it arrives as
 * whatever the author put in the box: a YouTube watch page, a youtu.be short
 * link, a Vimeo page, an https address of a .mp4, or the /uploads path this API
 * handed back a moment ago when they pressed "choose a file". Those are four
 * different players, and only one of them is ours.
 *
 * The address the page is allowed to load is never the text that was typed. For
 * YouTube, Vimeo, Facebook, Instagram and TikTok it is rebuilt from the video id
 * by videoService, which also picks the player that sets no cookie before anyone
 * presses play. A file plays from the address it came from and nothing else. A
 * link from a platform this site has not been told about is kept as it was
 * written and served as a button to that platform, so a video an author attached
 * is always on the story; only text that is not an address at all is refused,
 * with a reason the author can read in the box they typed it into.
 */

const videoService = require('./videoService');
const { withHttpsScheme } = require('./urlGuard');

// A file this API serves, as uploadRoutes returns it. The extension list is the
// one the upload endpoint accepts, so a stored path can never point at something
// that is not a video.
const OWN_VIDEO = /^\/uploads\/[a-z0-9._-]{1,120}\.(?:mp4|webm|ogv|ogg|m4v|mov)$/i;

// Something with a host and a dot is an address a reader can open on the
// platform's own page, even if this site has not been told how to embed it. A
// word, a name, half a link: those are a mistake in the box, and the author
// hears about it there rather than in the story they thought they published.
const ADDRESS_SHAPED = /^(?:https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(?:[/?#]|$)/i;

/**
 * @param {string} value what the author pasted, or the /uploads path from the
 *                       upload endpoint. Empty means "this story has no video".
 * @returns {{ok: true, fields: {videoUrl: string, videoSource: string, videoEmbedUrl: string}}
 *          | {ok: false, reason: string}}
 */
function resolve(value) {
  const url = String(value === undefined || value === null ? '' : value).trim();
  if (!url) {
    return { ok: true, fields: { videoUrl: '', videoSource: '', videoEmbedUrl: '' } };
  }

  if (OWN_VIDEO.test(url)) {
    const path = url.slice(0, 500);
    return { ok: true, fields: { videoUrl: path, videoSource: 'file', videoEmbedUrl: path } };
  }

  const read = videoService.describe(url);
  if (!read.ok) {
    // A link this site cannot embed is still a link the author meant to attach,
    // so it is stored and shown as a button that opens the platform's own page.
    // Refusing the whole save instead is what left a writer staring at a story
    // with no video in it and no idea the paste had been dropped.
    if (ADDRESS_SHAPED.test(withHttpsScheme(url))) {
      return { ok: true, fields: { videoUrl: url.slice(0, 500), videoSource: 'link', videoEmbedUrl: '' } };
    }
    return {
      ok: false,
      reason: `The video address is not one we can play — ${read.reason}. Paste a YouTube, Vimeo, Facebook, Instagram or TikTok link, the https address of a video file, or upload the clip.`,
    };
  }
  return {
    ok: true,
    fields: { videoUrl: url.slice(0, 500), videoSource: read.source, videoEmbedUrl: read.embedUrl }
  };
}

module.exports = { resolve, OWN_VIDEO };
