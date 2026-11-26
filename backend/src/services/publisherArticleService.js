const dns = require('node:dns').promises;
const net = require('node:net');

const REQUEST_TIMEOUT_MS = 14000;
const MAX_HTML_BYTES = 3 * 1024 * 1024;
const MAX_TEXT_CHARS = 30000;
const MAX_IMAGES = 12;
const USER_AGENT = 'RADAR-Newsroom/1.0 (+https://www.radartimes.2bd.net/about)';

function decodeEntities(value = '') {
  return String(value).replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
function stripMarkup(value = '') {
  return decodeEntities(String(value)
    .replace(/<(script|style|noscript|svg|nav|footer|header|aside|form|iframe|button)[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ').trim();
}
function meta(html, key) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const name = (tag.match(/\b(?:property|name|itemprop)=["']([^"']+)["']/i) || [])[1];
    if (String(name || '').toLowerCase() !== key.toLowerCase()) continue;
    return decodeEntities((tag.match(/\bcontent=["']([^"']*)["']/i) || [])[1] || '');
  }
  return '';
}
function safePublicUrl(raw, base) {
  try {
    const url = new URL(raw, base);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return '';
    if (url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname.endsWith('.local')) return '';
    return url.toString();
  } catch { return ''; }
}
function isPrivateAddress(address) {
  const family = net.isIP(address);
  if (family === 4) {
    const p = address.split('.').map(Number);
    return p[0] === 0 || p[0] === 10 || p[0] === 127 || p[0] >= 224 ||
      (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127);
  }
  if (family === 6) {
    const value = address.toLowerCase();
    return value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd') ||
      value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') ||
      value.startsWith('feb') || value.startsWith('::ffff:');
  }
  return true;
}
async function assertPublicHost(url) {
  const host = new URL(url).hostname;
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error('SOURCE_HOST_BLOCKED');
    return;
  }
  const addresses = await dns.lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) throw new Error('SOURCE_HOST_BLOCKED');
}
async function requestText(url, accept = 'text/html,application/xhtml+xml') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: 'GET', redirect: 'manual', signal: controller.signal,
      headers: { accept, 'user-agent': USER_AGENT },
    });
  } finally { clearTimeout(timer); }
}
function robotsAllows(robotsText, pathname) {
  let active = false;
  const rules = [];
  for (const rawLine of String(robotsText || '').split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1].trim().toLowerCase();
    const value = match[2].trim();
    if (key === 'user-agent') active = value === '*' || /radar-newsroom/i.test(value);
    else if (active && (key === 'disallow' || key === 'allow') && value) rules.push({ key, value });
  }
  const applicable = rules.filter((rule) => pathname.startsWith(rule.value))
    .sort((a, b) => b.value.length - a.value.length);
  return !applicable.length || applicable[0].key === 'allow';
}
async function fetchRobots(url) {
  const robotsUrl = new URL('/robots.txt', url).toString();
  await assertPublicHost(robotsUrl);
  let response;
  try { response = await requestText(robotsUrl, 'text/plain'); } catch { return null; }
  if (response.status === 404) return '';
  if (!response.ok) return null;
  return (await response.text()).slice(0, 200000);
}
function collectImages(html, base) {
  const found = [];
  const add = (raw, caption = '', credit = '') => {
    const url = safePublicUrl(raw, base);
    if (!url || found.some((item) => item.url === url)) return;
    found.push({ url, caption: stripMarkup(caption).slice(0, 300), credit: stripMarkup(credit).slice(0, 160) });
  };
  for (const key of ['og:image', 'og:image:secure_url', 'twitter:image']) add(meta(html, key));
  const imageTags = html.match(/<img\b[^>]*>/gi) || [];
  for (const tag of imageTags) {
    const raw = (tag.match(/\b(?:src|data-src|data-lazy-src)=["']([^"']+)["']/i) || [])[1];
    if (!raw) continue;
    add(raw, (tag.match(/\balt=["']([^"']*)["']/i) || [])[1] || '');
    if (found.length >= MAX_IMAGES) break;
  }
  return found.slice(0, MAX_IMAGES);
}
function extractBody(html) {
  const candidates = [];
  for (const pattern of [/<article\b[^>]*>([\s\S]*?)<\/article\s*>/i, /<main\b[^>]*>([\s\S]*?)<\/main\s*>/i]) {
    const match = html.match(pattern);
    if (match && match[1]) candidates.push(match[1]);
  }
  const paragraphs = html.match(/<p\b[^>]*>[\s\S]*?<\/p\s*>/gi) || [];
  if (paragraphs.length) candidates.push(paragraphs.join('\n'));
  let selected = candidates.sort((a, b) => b.length - a.length)[0] || '';
  if (!selected) return '';
  selected = selected.replace(/<(script|style|noscript|svg|nav|footer|header|aside|form|iframe|button|figure|picture)[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(?:div|section|p|h[1-6]|li|blockquote|br)\b[^>]*>/gi, '\n')
    .replace(/<\/(?:div|section|p|h[1-6]|li|blockquote)>/gi, '\n').replace(/<[^>]+>/g, ' ');
  return decodeEntities(selected).split(/\n+/).map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 35).join('\n\n').slice(0, MAX_TEXT_CHARS);
}
function jsonLdMetadata(html) {
  const scripts = html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script\s*>/gi) || [];
  for (const script of scripts) {
    const raw = script.replace(/^<script\b[^>]*>/i, '').replace(/<\/script\s*>$/i, '');
    try {
      const parsed = JSON.parse(raw);
      const stack = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (stack.length) {
        const item = stack.pop();
        if (!item || typeof item !== 'object') continue;
        if (Array.isArray(item)) { stack.push(...item); continue; }
        if (item['@graph']) stack.push(...(Array.isArray(item['@graph']) ? item['@graph'] : [item['@graph']]));
        if (/Article|NewsArticle|ReportageNewsArticle/i.test([].concat(item['@type'] || []).join(' '))) return item;
      }
    } catch { /* Ignore malformed publisher structured data. */ }
  }
  return {};
}
async function fetchPublisherArticle(rawUrl) {
  const initialUrl = safePublicUrl(rawUrl);
  if (!initialUrl) return { status: 'unavailable', reason: 'The publisher URL is not a permitted HTTPS address.' };
  try {
    let currentUrl = initialUrl;
    let response;
    for (let hop = 0; hop <= 3; hop += 1) {
      await assertPublicHost(currentUrl);
      response = await requestText(currentUrl);
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        const nextUrl = location && safePublicUrl(location, currentUrl);
        if (!nextUrl || hop === 3) return { status: 'unavailable', reason: 'The publisher redirected to an unsupported address.' };
        currentUrl = nextUrl;
        continue;
      }
      break;
    }
    if (!response || !response.ok) return { status: 'unavailable', reason: 'Publisher page returned HTTP ' + (response?.status || 'error') + '.' };
    if (!/text\/html|application\/xhtml\+xml/i.test(response.headers.get('content-type') || '')) {
      return { status: 'unavailable', reason: 'Publisher did not provide an HTML article page.' };
    }
    if (Number(response.headers.get('content-length') || 0) > MAX_HTML_BYTES) return { status: 'unavailable', reason: 'Publisher page exceeds the safe extraction size.' };
    const html = await response.text();
    if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) return { status: 'unavailable', reason: 'Publisher page exceeds the safe extraction size.' };
    const robots = await fetchRobots(currentUrl);
    if (robots === null) return { status: 'restricted', reason: 'Publisher robots.txt could not be checked; extraction was skipped.' };
    if (!robotsAllows(robots, new URL(currentUrl).pathname)) return { status: 'restricted', reason: 'Publisher robots.txt disallows automated article extraction.' };
    const structured = jsonLdMetadata(html);
    const body = extractBody(html);
    const title = stripMarkup(meta(html, 'og:title') || structured.headline || structured.name || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
    const description = stripMarkup(meta(html, 'og:description') || structured.description || meta(html, 'description'));
    const author = Array.isArray(structured.author)
      ? structured.author.map((entry) => typeof entry === 'string' ? entry : entry?.name).filter(Boolean).join(', ')
      : (typeof structured.author === 'string' ? structured.author : structured.author?.name || '');
    const images = collectImages(html, currentUrl);
    const publishedAt = structured.datePublished || meta(html, 'article:published_time') || '';
    const canonical = safePublicUrl(meta(html, 'og:url') || structured.url || currentUrl, currentUrl) || currentUrl;
    const base = {
      status: body.length >= 500 ? 'extracted' : 'limited',
      url: canonical, title, description, author: stripMarkup(author).slice(0, 200),
      publishedAt, images, text: body, wordCount: body ? body.split(/\s+/).length : 0,
    };
    if (body.length < 500) return { ...base, reason: 'The publisher page exposed too little article text for a full-source draft.' };
    return { ...base, extractedAt: new Date() };
  } catch (error) {
    return { status: 'unavailable', reason: error.name === 'AbortError' ? 'Publisher page timed out.' :
      error.message === 'SOURCE_HOST_BLOCKED' ? 'Publisher host resolved to a private or restricted network address.' :
        'Publisher page could not be safely retrieved.' };
  }
}
module.exports = { fetchPublisherArticle };
