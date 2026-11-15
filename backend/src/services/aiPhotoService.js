/**
 * Checking a picture link before anyone is shown it.
 *
 * A model asked for photographs will happily name a URL that has never existed,
 * and a newsroom that prints those gets a page of broken thumbnails and a
 * reputation for it. So nothing a model suggests reaches the admin's screen
 * until this server has fetched it and seen what actually came back.
 *
 * What "seen" means:
 *   - the address is https, public, and answers 200 with an image content type;
 *   - the real pixel size is read off the bytes of the picture itself rather
 *     than trusted from a header or a caption, so a 400px thumbnail cannot be
 *     offered as a 4K one;
 *   - where the source can serve a bigger version, the biggest one up to 4K on
 *     its longest side is what gets handed over - that is what "dynamic 4K"
 *     means here: not inventing detail a picture does not have, but never
 *     paying for a smaller one than the source already keeps.
 *
 * Wikimedia Commons is the one host with a documented way to ask for a specific
 * width, so files from there get an explicit rendition. Everything else is
 * served at whatever size its own site publishes, and the admin is told which
 * of the two it was.
 *
 * Because a model's memory of URLs is unreliable, the picker is fed from two
 * places: the links the model names (each one fetched and measured before it is
 * shown), and Commons' own search on the topic, which can only return files
 * that actually exist there with their real size, author and licence attached.
 *
 * A word on the risk this carries: an admin-only endpoint that fetches URLs is
 * a door into the server's own network if it is left open. The address is
 * refused before it is fetched by the shared guard in urlGuard.js, which is the
 * same one the broadcast panel goes through. That is a policy, not a proof - the
 * real protection is that this runs behind ADMIN, one person, asking on their
 * own.
 */

// 3840 on the longest side is UHD. Nothing is asked for beyond that, and
// nothing is claimed at that size unless the source really holds it.
const MAX_EDGE = 3840;
// Enough bytes to read the header of a PNG, JPEG, GIF or WebP picture.
const PROBE_BYTES = 96 * 1024;
const PROBE_TIMEOUT_MS = 8000;

// The guard is shared with the one other endpoint that fetches a link a person
// typed in, so the two cannot drift apart.
const { isPublicHttpsImage } = require('./urlGuard');

/**
 * Commons gives us a file page or a hosted path; both mean the same picture and
 * both can be asked for a rendition of an exact width.
 */
function commonsFile(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return '';
  }
  const host = parsed.hostname.toLowerCase();
  const onCommons = host === 'commons.wikimedia.org' || host.endsWith('.wikimedia.org');
  const upload = host === 'upload.wikimedia.org';
  if (!onCommons && !upload) return '';

  // A title can reach us spelled five ways - a Special:FilePath link, a file
  // page, any of those with the colon left percent-encoded in the address, or
  // the stored path on the upload host. All five mean one picture, and the
  // name is what the API is asked for, so they are folded together here.
  const path = decodeURIComponent(parsed.pathname);
  const named = (value) => String(value || '').replace(/_/g, ' ').trim();

  // /wiki/Special:FilePath/Some_file.jpg
  const filePath = path.match(/\/Special:FilePath\/([^?#]+)/i);
  if (filePath) return named(filePath[1]);

  // /wiki/File:Some_file.jpg
  const title = path.match(/\/(?:wiki|file)\/((?:File|Image):[^?#]+)/i);
  if (title) return named(title[1]);

  // /wikipedia/commons/a/ab/Some.jpg
  if (upload && /\/wikipedia\/commons\//i.test(path)) {
    const segments = path.split('/').filter(Boolean);
    const last = segments.pop() || '';
    // A model that means well will paste the thumbnail it saw on a page:
    // .../thumb/a/ab/Some.jpg/800px-Some.jpg. The bytes at the end are a reduced
    // copy of a file whose real name is the segment before it, and asking
    // Commons for that name is what turns an 800px suggestion into the full
    // picture the newsroom can actually print.
    if (/^\/wikipedia\/commons\/thumb\//i.test(path)) {
      const real = segments[segments.length - 1] || '';
      if (/\.(jpe?g|png|webp|gif|svg|tiff?)$/i.test(real)) return named(real);
    }
    if (/\.(jpe?g|png|webp|gif|svg|tiff?)$/i.test(last)) return named(last);
  }
  return '';
}

async function commonsInfo(file) {
  // A Commons title always lives in the File: namespace; the name arrives with
  // or without it depending on which kind of link the model quoted.
  const title = `File:${String(file).replace(/^(File|Image):/i, '')}`;
  const api = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=${MAX_EDGE}&titles=${encodeURIComponent(title)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  let answer;
  try {
    answer = await fetch(api, { signal: controller.signal, headers: { 'user-agent': 'RADAR newsroom https://ijwi-ry--ukuri.web.app' } });
  } catch {
    throw new Error('Commons could not be reached');
  } finally {
    clearTimeout(timer);
  }
  if (!answer.ok) throw new Error(`Commons answered ${answer.status}`);
  const payload = await answer.json();
  const page = Object.values(payload?.query?.pages || {})[0];
  const info = page?.imageinfo?.[0];
  if (!info) throw new Error('Commons has no such file');
  const width = Number(info.width) || 0;
  const height = Number(info.height) || 0;
  // The API hands back a thumb at the requested width, or the original when the
  // picture is already smaller than it - which is exactly the honest answer.
  const asked = Math.min(MAX_EDGE, width);
  const large = width >= asked && info.thumburl && Number(info.thumbwidth) === asked
    ? info.thumburl
    : info.url;
  return {
    url: large || info.url,
    originalUrl: info.url,
    // The file page rather than the hosted bytes: that is the address carrying
    // the licence and the contributor a credit is supposed to point at.
    pageUrl: info.descriptionurl || '',
    width,
    height,
    bytes: Number(info.size) || 0,
    mime: info.mime || '',
    creditHint: 'Wikimedia Commons',
    dynamic: width > asked ? `resized to ${asked}px wide` : 'served at full size'
  };
}

/**
 * Asking Commons itself for pictures of the topic.
 *
 * A model can name a real file, and often does, but it also names plausible
 * ones that were never uploaded. The repository's own search is the difference
 * between a picker that is sometimes empty and one that only ever offers
 * photographs somebody actually filed there - and it answers with the true
 * dimensions, the author and the licence in the same request, so nothing has to
 * be guessed at or cropped out of a caption later.
 */
const SEARCHABLE_MIME = /^image\/(jpeg|png|webp)$/i;
// Below this the picture is a thumbnail, not a photograph a page can print.
const SHORTEST_USEFUL_EDGE = 900;

function stripTags(value) {
  return String(value || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function creditFor(info) {
  const meta = info.extmetadata || {};
  const artist = stripTags(meta.Artist?.value);
  const license = stripTags(meta.LicenseShortName?.value);
  const who = artist && !/^unknown$/i.test(artist) ? artist : 'Wikimedia contributor';
  return `${who} / Wikimedia Commons${license ? ` · ${license}` : ''}`.slice(0, 160);
}

async function search(query, { limit = 8 } = {}) {
  const term = String(query || '').trim();
  if (!term) return { photos: [], note: '' };
  const api = new URL('https://commons.wikimedia.org/w/api.php');
  // Ask for more than we will show: Commons returns diagrams, scans and small
  // snapshots alongside photographs, and every one of those that is not a
  // picture a page can print gets dropped below.
  const wanted = Math.max(Number(limit) || 8, 20);
  // The parameters are set through searchParams on purpose: a quoted topic is
  // then escaped by the URL parser instead of by hand, so an apostrophe in a
  // search cannot close the query and ride along to Commons.
  api.searchParams.set('action', 'query');
  api.searchParams.set('format', 'json');
  api.searchParams.set('generator', 'search');
  api.searchParams.set('gsrnamespace', '6');
  api.searchParams.set('gsrlimit', String(wanted));
  api.searchParams.set('gsrsearch', `filetype:bitmap ${term}`.slice(0, 240));
  api.searchParams.set('prop', 'imageinfo');
  api.searchParams.set('iiprop', 'url|size|mime|extmetadata');
  api.searchParams.set('iiurlwidth', String(MAX_EDGE));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS * 2);
  let payload;
  try {
    const answer = await fetch(api.toString(), {
      signal: controller.signal,
      headers: { 'user-agent': 'RADAR newsroom https://ijwi-ry--ukuri.web.app' }
    });
    if (!answer.ok) throw new Error(`Commons answered ${answer.status}`);
    payload = await answer.json();
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Commons took too long to answer');
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const pages = Object.values(payload?.query?.pages || {})
    .map((page) => {
      const info = page?.imageinfo?.[0];
      if (!info || !SEARCHABLE_MIME.test(info.mime || '')) return null;
      const width = Number(info.width) || 0;
      const height = Number(info.height) || 0;
      if (Math.min(width, height) < SHORTEST_USEFUL_EDGE) return null;
      const longest = Math.max(width, height);
      const asked = Math.min(MAX_EDGE, width);
      // Only take the rendition when it is the size that was asked for; when the
      // original is smaller, the original is the honest answer.
      const url = info.thumburl && Number(info.thumbwidth) === asked ? info.thumburl : info.url;
      return {
        url,
        originalUrl: info.url,
        pageUrl: info.descriptionurl || '',
        width,
        height,
        bytes: Number(info.size) || 0,
        credit: creditFor(info),
        source: 'commons.wikimedia.org',
        why: String(page.title || '').replace(/^(File|Image):/i, '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ').slice(0, 200),
        served: longest > asked ? `resized to ${asked}px wide` : 'served at full size',
        atUhd: longest >= MAX_EDGE
      };
    })
    .filter(Boolean);

  pages.sort((a, b) => Math.max(b.width, b.height) - Math.max(a.width, a.height));
  return {
    photos: pages.slice(0, limit),
    // Saying the search came back empty is better than padding the picker with
    // pictures of something else.
    note: pages.length ? '' : `Commons has no photograph at least ${SHORTEST_USEFUL_EDGE}px tall or wide under "${term.slice(0, 80)}".`
  };
}

function readImageSize(buffer) {
  if (!buffer || buffer.length < 24) return null;
  // PNG: after the 8-byte signature comes IHDR with two big-endian 32-bit ints.
  if (buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  // GIF: logical screen descriptor, little-endian 16-bit.
  if (buffer.toString('ascii', 0, 3) === 'GIF') {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  // JPEG: walk the markers until a start-of-frame one says how big the picture is.
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      const length = buffer.readUInt16BE(offset + 2);
      if (!length) return null;
      offset += 2 + length;
    }
    return null;
  }
  // WebP: RIFF....WEBP then VP8X, VP8 or VP8L.
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buffer.toString('ascii', 12, 16);
    if (chunk === 'VP8X') {
      return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
    }
    if (chunk === 'VP8 ') {
      const start = buffer.indexOf(Buffer.from([0x9d, 0x01, 0x2a]));
      if (start > -1 && start + 6 < buffer.length) {
        return { width: buffer.readUInt16LE(start + 3) & 0x3fff, height: buffer.readUInt16LE(start + 5) & 0x3fff };
      }
    }
    return null;
  }
  return null;
}

/**
 * Fetch an address far enough to know what it is, and no further.
 *
 * The body is read a piece at a time and cut off at PROBE_BYTES: enough for the
 * header of the picture, never enough for a stranger to make this server stream
 * a two-gigabyte file across the internet on the newsroom's bill.
 */
async function fetchHeadOf(url) {
  const parsed = isPublicHttpsImage(url);
  if (!parsed.ok) throw new Error(parsed.reason);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const answer = await fetch(parsed.url.toString(), {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'RADAR newsroom https://ijwi-ry--ukuri.web.app', range: 'bytes=0-1048575' }
    });
    if (!answer.ok) throw new Error(`the source answered ${answer.status}`);
    const type = String(answer.headers.get('content-type') || '');
    if (!/^image\//i.test(type)) throw new Error(`that is a ${type.split(';')[0] || 'non-image'}, not a picture`);
    const declared = Number(answer.headers.get('content-length')) || 0;
    const limited = await limitBytes(answer, PROBE_BYTES);
    const size = readImageSize(limited);
    return {
      url: answer.url || parsed.url.toString(),
      type,
      bytes: declared > limited.length ? declared : limited.length,
      width: size?.width || 0,
      height: size?.height || 0
    };
  } finally {
    clearTimeout(timer);
  }
}

async function limitBytes(response, cap) {
  if (!response.body) return Buffer.alloc(0);
  const chunks = [];
  let total = 0;
  for await (const piece of response.body) {
    chunks.push(Buffer.from(piece));
    total += piece.length;
    // Enough to see the size of the picture. The rest of the download is
    // cancelled rather than paid for.
    if (total >= cap) {
      await response.body.cancel().catch(() => {});
      break;
    }
  }
  return Buffer.concat(chunks, Math.min(total, cap));
}

/**
 * Every candidate, checked. What cannot be proven is dropped and reported.
 */
async function verify(photos = [], { limit = 8 } = {}) {
  const checked = [];
  const dropped = [];
  for (const photo of photos.slice(0, limit)) {
    const url = String(photo?.url || '').trim();
    if (!url) continue;
    try {
      const file = commonsFile(url);
      const info = file ? await commonsInfo(file) : await fetchHeadOf(url);
      if (!info.width || !info.height) {
        dropped.push({ url, credit: photo.credit || '', reason: 'the picture loaded but its size could not be read' });
        continue;
      }
      const longest = Math.max(info.width, info.height);
      checked.push({
        url: info.url,
        originalUrl: info.originalUrl || info.url,
        pageUrl: info.pageUrl || info.url,
        credit: String(photo.credit || info.creditHint || '').slice(0, 160),
        source: String(photo.source || new URL(info.url).hostname).slice(0, 120),
        why: String(photo.why || '').slice(0, 200),
        width: info.width,
        height: info.height,
        bytes: info.bytes || 0,
        // Whether the size on offer is the whole picture or a rendition the
        // source made at our request. The admin should know which they are
        // putting on the page.
        served: info.dynamic || 'served by the source as-is',
        atUhd: longest >= MAX_EDGE
      });
    } catch (error) {
      dropped.push({ url, credit: String(photo?.credit || '').slice(0, 160), reason: String(error.message || error).slice(0, 160) });
    }
  }
  // Biggest first: the one a page can crop and still print sharp is the one to
  // put in front of the editor.
  checked.sort((a, b) => Math.max(b.width, b.height) - Math.max(a.width, a.height));
  return { photos: checked, dropped };
}

module.exports = { verify, search, isPublicHttpsImage, readImageSize, commonsFile, MAX_EDGE };
