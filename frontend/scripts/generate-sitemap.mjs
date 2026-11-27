// Writes the sitemap set into public/ from the live API, one file per kind of
// content, plus a sitemap index at public/sitemap.xml:
//   sitemap.xml              index  -> lists every file below
//   sitemap-pages.xml        static pages (home, all articles, categories,
//                            authors, live, the scores desk, search, and the
//                            newsroom pages: about, contact,
//                            editorial-policy, corrections, advertising, privacy,
//                            cookies, disclaimer, terms)
//   sitemap-articles.xml     one URL per published story
//   sitemap-categories.xml   one URL per category feed that the section tree
//                            does not already publish at its own address
//   sitemap-sections.xml     one URL per section and sub-section page
//   sitemap-writers.xml      one URL per author profile page
//   sitemap-images.xml       Google's image sitemap: the photo the newsroom
//                            attached to each story, tied to the page a reader
//                            lands on when they open it from an image search
//   sitemap-news.xml         Google News sitemap: English stories from the last
//                            two days (Google only reads that window)
//   feed.xml                 RSS 2.0 feed of the latest 30 published stories
// Runs automatically before `npm run build`; re-run it after publishing news that
// must be indexed sooner:  cd frontend && npm run sitemap
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE_URL = 'https://www.radartimes.2bd.net'
const SITE_NAME = 'RADAR'
const SITE_DESCRIPTION = 'News written by approved writers: world, politics, business, technology, sports, entertainment and health.'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function apiBase() {
  if (process.env.VITE_API_URL) return process.env.VITE_API_URL
  const file = path.join(root, '.env.production')
  if (fs.existsSync(file)) {
    const match = fs.readFileSync(file, 'utf8').match(/^VITE_API_URL=(.+)$/m)
    if (match) return match[1].trim()
  }
  return 'http://localhost:5000/api'
}

// Uploaded pictures are served by the API origin, not by the site, so a feed
// entry has to point at the server that actually holds the file.
const API_ORIGIN = new URL(apiBase()).origin

const escape = (value) => String(value).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c])

function isoDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}

function isoStamp(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function rfc822Date(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toUTCString()
}

function mediaUrl(value) {
  if (!value) return ''
  if (/^(https?:|data:|blob:)/i.test(value)) return value
  if (value.startsWith('/uploads/')) return `${API_ORIGIN}${value}`
  return ''
}

async function json(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`${url} -> ${response.status}`)
  const body = await response.json()
  return body.data
}

async function publishedArticles(base) {
  const articles = []
  const limit = 100
  for (let page = 1; page <= 50; page += 1) {
    const data = await json(`${base}/articles?page=${page}&limit=${limit}`)
    const batch = data?.articles ?? []
    articles.push(...batch)
    if (batch.length < limit || articles.length >= (data?.total ?? 0)) break
  }
  return articles
}

function urlEntry(loc, lastmod, priority, changefreq) {
  return [
    '  <url>',
    `    <loc>${escape(loc)}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    '  </url>',
  ].filter(Boolean).join('\n')
}

function urlset(entries) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`
}

function write(name, xml) {
  fs.writeFileSync(path.join(root, 'public', name), xml)
  return `${SITE_URL}/${name}`
}

const articleUrl = (article) => `${SITE_URL}/article/${article.slug}`

// Static article documents are written into public/ before Vite copies it to
// dist/. Google and social crawlers therefore receive the real story metadata
// and readable text in the first HTML response, without waiting for React/API JS.
function htmlEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character])
}

function articlePlainText(value) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|blockquote|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => { const point = Number(code); return point <= 0x10ffff ? String.fromCodePoint(point) : ' ' })
    .replace(/&#x([\da-f]+);/gi, (_, code) => { const point = parseInt(code, 16); return point <= 0x10ffff ? String.fromCodePoint(point) : ' ' })
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function renderPrerenderedArticle(article, shell) {
  const canonical = articleUrl(article)
  const title = `${article.title || 'News'} | RADAR`
  const description = String(article.metaDescription || article.summary || '').trim().slice(0, 300)
  const image = mediaUrl(article.featuredImage) || `${SITE_URL}/icons/icon-512x512.png`
  const published = isoStamp(article.publishedAt || article.createdAt)
  const modified = isoStamp(article.updatedAt || article.publishedAt || article.createdAt)
  const author = article.author && typeof article.author === 'object' ? article.author : null
  const category = article.category && typeof article.category === 'object' ? article.category : null
  const paragraphs = articlePlainText(article.content || article.body || article.text || article.summary || '')
  const body = paragraphs.length
    ? paragraphs.map((paragraph) => `<p>${htmlEscape(paragraph)}</p>`).join('\n')
    : (description ? `<p>${htmlEscape(description)}</p>` : '')
  const schema = {
    '@context': 'https://schema.org',
    '@type': article.isSponsored ? 'Article' : 'NewsArticle',
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    headline: article.title,
    description: description || undefined,
    image: [image],
    datePublished: published || undefined,
    dateModified: modified || undefined,
    inLanguage: article.language || 'en',
    isAccessibleForFree: true,
    articleSection: category?.name || undefined,
    keywords: Array.isArray(article.tags) ? article.tags.join(', ') : undefined,
    author: author ? {
      '@type': 'Person',
      name: author.fullName || author.username || 'RADAR',
      url: author._id ? `${SITE_URL}/user/${author._id}` : undefined,
    } : { '@type': 'Organization', name: 'RADAR' },
    publisher: {
      '@type': 'Organization',
      name: 'RADAR TIMES',
      url: `${SITE_URL}/`,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/icons/icon-192x192.png` },
    },
  }
  const safeSchema = JSON.stringify(schema).replace(/</g, '\\u003c')
  let html = shell
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${htmlEscape(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/?\s*>/i, `<meta name="description" content="${htmlEscape(description)}" />`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/?\s*>/i, `<link rel="canonical" href="${canonical}" />`)
    .replace(/<meta property="og:type" content="[^"]*"\s*\/?\s*>/i, '<meta property="og:type" content="article" />')
    .replace(/<meta property="og:title" content="[^"]*"\s*\/?\s*>/i, `<meta property="og:title" content="${htmlEscape(title)}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/?\s*>/i, `<meta property="og:description" content="${htmlEscape(description)}" />`)
    .replace(/<meta property="og:url" content="[^"]*"\s*\/?\s*>/i, `<meta property="og:url" content="${canonical}" />`)
    .replace(/<meta property="og:image" content="[^"]*"\s*\/?\s*>/i, `<meta property="og:image" content="${htmlEscape(image)}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*"\s*\/?\s*>/i, `<meta name="twitter:title" content="${htmlEscape(title)}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*"\s*\/?\s*>/i, `<meta name="twitter:description" content="${htmlEscape(description)}" />`)
    .replace(/<meta name="twitter:image" content="[^"]*"\s*\/?\s*>/i, `<meta name="twitter:image" content="${image}" />`)
  const staticStory = `<main id="radar-prerendered-story"><article><header><p><a href="/">RADAR TIMES</a> / <a href="/articles">News</a></p><h1>${htmlEscape(article.title)}</h1>${description ? `<p>${htmlEscape(description)}</p>` : ''}${author?.fullName ? `<p>By ${htmlEscape(author.fullName)}</p>` : ''}${published ? `<time datetime="${published}">${published.slice(0, 10)}</time>` : ''}</header>${article.featuredImage ? `<figure><img src="${htmlEscape(image)}" alt="${htmlEscape(article.title)}" width="1200" height="675" /><figcaption>${htmlEscape(article.imageCaption || '')}</figcaption></figure>` : ''}<div>${body}</div></article></main>`
  html = html.replace('</head>', `<script type="application/ld+json">${safeSchema}</script>\\n</head>`)
  html = html.replace('<div id="app"></div>', `<div id="app">${staticStory}</div>`)
  return html
}


function renderPrerenderedListingPage(articles, shell, options) {
  const { pathname, title, description, heading, limit, pageType } = options
  const canonical = SITE_URL + pathname
  const stories = byNewest(articles.filter((article) => article?.slug && article?.title)).slice(0, limit)
  const cards = stories.map((article, index) => {
    const url = articleUrl(article)
    const image = mediaUrl(article.featuredImage) || SITE_URL + '/icons/icon-512x512.png'
    const summary = String(article.metaDescription || article.summary || article.content || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 260)
    const stamp = isoStamp(publishedStamp(article))
    const author = article.author?.fullName || article.author?.username || ''
    const meta = htmlEscape(article.category?.name || 'News') +
      (stamp ? ' · <time datetime="' + stamp + '">' + stamp.slice(0, 10) + '</time>' : '') +
      (author ? ' · By ' + htmlEscape(author) : '')
    return '<article class="radar-seo-story"><a href="' + htmlEscape(url) + '" aria-label="Read ' + htmlEscape(article.title) + '"><img src="' + htmlEscape(image) + '" alt="' + htmlEscape(article.title) + '" width="640" height="360" ' + (index > 5 ? 'loading="lazy"' : 'fetchpriority="high"') + ' /></a><div><p class="radar-seo-meta">' + meta + '</p><h2><a href="' + htmlEscape(url) + '">' + htmlEscape(article.title) + '</a></h2>' + (summary ? '<p>' + htmlEscape(summary) + '</p>' : '') + '<a class="radar-seo-read" href="' + htmlEscape(url) + '">Read full story</a></div></article>'
  }).join('\n')
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description,
    url: canonical,
    isPartOf: { '@id': SITE_URL + '/#website' },
    mainEntity: {
      '@type': 'ItemList',
      itemListOrder: 'https://schema.org/ItemListOrderDescending',
      numberOfItems: stories.length,
      itemListElement: stories.map((article, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: articleUrl(article),
        name: article.title,
      })),
    },
  }
  const safeSchema = JSON.stringify(schema).replace(/</g, '\\u003c')
  let html = shell
    .replace(/<title>[\s\S]*?<\/title>/i, '<title>' + htmlEscape(title) + '</title>')
    .replace(/<meta name="description" content="[^"]*"\s*\/?\s*>/i, '<meta name="description" content="' + htmlEscape(description) + '" />')
    .replace(/<link rel="canonical" href="[^"]*"\s*\/?\s*>/i, '<link rel="canonical" href="' + canonical + '" />')
    .replace(/<meta property="og:type" content="[^"]*"\s*\/?\s*>/i, '<meta property="og:type" content="website" />')
    .replace(/<meta property="og:title" content="[^"]*"\s*\/?\s*>/i, '<meta property="og:title" content="' + htmlEscape(title) + '" />')
    .replace(/<meta property="og:description" content="[^"]*"\s*\/?\s*>/i, '<meta property="og:description" content="' + htmlEscape(description) + '" />')
    .replace(/<meta property="og:url" content="[^"]*"\s*\/?\s*>/i, '<meta property="og:url" content="' + canonical + '" />')
    .replace(/<meta name="twitter:title" content="[^"]*"\s*\/?\s*>/i, '<meta name="twitter:title" content="' + htmlEscape(title) + '" />')
    .replace(/<meta name="twitter:description" content="[^"]*"\s*\/?\s*>/i, '<meta name="twitter:description" content="' + htmlEscape(description) + '" />')
  const intro = pageType === 'home'
    ? 'Independent reporting and useful updates from Rwanda, Africa and around the world. Explore the latest headlines, understand the context, and follow the stories shaping our communities.'
    : 'Browse the latest reporting from RADAR TIMES, with news and analysis from Rwanda, Africa and around the world. Open each story for its full report, sources and updates.'
  const listing = '<main id="radar-prerendered-' + pageType + '" class="radar-seo-listing"><nav aria-label="Main navigation"><a href="/">RADAR TIMES</a><a href="/articles">All news</a><a href="/categories">Categories</a><a href="/about">About RADAR</a></nav><header><p class="radar-seo-eyebrow">RADAR TIMES · RWANDA AND THE WORLD</p><h1>' + htmlEscape(heading) + '</h1><p>' + htmlEscape(intro) + '</p></header><section aria-label="Latest news">' + (cards || '<p>New reports are being prepared. Please check back soon.</p>') + '</section><footer><a href="/articles">Browse all news</a> · <a href="/editorial-policy">Editorial policy</a> · <a href="/contact">Contact the newsroom</a></footer></main>'
  const listingStyles = '<style>.radar-seo-listing{max-width:1120px;margin:0 auto;padding:24px 18px;color:#172033;font-family:Inter,Arial,sans-serif}.radar-seo-listing nav{display:flex;gap:18px;flex-wrap:wrap;padding:12px 0;border-bottom:1px solid #e5e7eb}.radar-seo-listing nav a,.radar-seo-listing a{color:#1456b8;text-decoration:none}.radar-seo-listing header{padding:28px 0 18px}.radar-seo-listing h1{font-size:clamp(28px,5vw,44px);line-height:1.12;font-weight:800;margin:8px 0}.radar-seo-listing header p{max-width:760px;line-height:1.7;color:#526071}.radar-seo-eyebrow,.radar-seo-meta{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748b}.radar-seo-story{display:grid;grid-template-columns:minmax(110px,220px) 1fr;gap:18px;padding:18px 0;border-top:1px solid #e5e7eb}.radar-seo-story img{display:block;width:100%;height:auto;aspect-ratio:16/9;object-fit:cover;border-radius:10px}.radar-seo-story h2{font-size:20px;line-height:1.3;margin:6px 0}.radar-seo-story p{line-height:1.6;color:#526071}.radar-seo-read{font-weight:700;font-size:13px}.radar-seo-listing footer{padding:24px 0;border-top:1px solid #e5e7eb}@media(max-width:600px){.radar-seo-story{grid-template-columns:1fr}.radar-seo-story img{max-height:220px}}</style>'
  html = html.replace('</head>', listingStyles + '<script type="application/ld+json">' + safeSchema + '</script>\n</head>')
  html = html.replace(/<div id="app"><\/div>/i, '<div id="app">' + listing + '</div>')
  return html
}

function writePrerenderedLandingPages(articles) {
  const shellPath = path.join(root, 'index.html')
  if (!fs.existsSync(shellPath)) throw new Error('Cannot prerender public landing pages: index.html is missing')
  const shell = fs.readFileSync(shellPath, 'utf8')
  const homepage = renderPrerenderedListingPage(articles, shell, {
    pathname: '/',
    title: 'Latest News from Rwanda, Africa and the World',
    description: 'Read the latest independent news, reporting and analysis from Rwanda, Africa and around the world on RADAR TIMES.',
    heading: 'Latest News from Rwanda, Africa and the World',
    limit: 12,
    pageType: 'home',
  })
  fs.writeFileSync(shellPath, homepage)
  const articlesDirectory = path.join(root, 'public', 'articles')
  fs.mkdirSync(articlesDirectory, { recursive: true })
  const articlesPage = renderPrerenderedListingPage(articles, shell, {
    pathname: '/articles',
    title: 'Latest News and Reports',
    description: 'Browse the latest published news and reports from Rwanda, Africa and around the world on RADAR TIMES.',
    heading: 'All News and Latest Reports',
    limit: 48,
    pageType: 'articles',
  })
  fs.writeFileSync(path.join(articlesDirectory, 'index.html'), articlesPage)
  console.log('static landing pages: homepage and /articles generated with ' + Math.min(articles.length, 48) + ' published story links')
}

function writePrerenderedArticles(articles) {
  const shellPath = path.join(root, 'index.html')
  if (!fs.existsSync(shellPath)) throw new Error('Cannot prerender articles: public/index.html is missing')
  const shell = fs.readFileSync(shellPath, 'utf8')
  const outputRoot = path.join(root, 'public', 'article')
  let written = 0
  for (const article of articles) {
    if (!article?.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(article.slug) || !article.title) continue
    const directory = path.join(outputRoot, article.slug)
    fs.mkdirSync(directory, { recursive: true })
    fs.writeFileSync(path.join(directory, 'index.html'), renderPrerenderedArticle(article, shell))
    written += 1
  }
  console.log(`static article pages: ${written} generated for Google and social crawlers`)
}

const publishedStamp = (article) => article.publishedAt || article.createdAt || null

const byNewest = (articles) =>
  [...articles].sort((a, b) => new Date(publishedStamp(b) || 0) - new Date(publishedStamp(a) || 0))

// RSS 2.0 is what a reader subscribes to in a feed app: the latest stories,
// each pointing at its own page, with the writer and the section named.
function rssFeed(items) {
  const entries = items.slice(0, 30).map((article) => {
    const url = articleUrl(article)
    const stamp = rfc822Date(publishedStamp(article))
    const image = mediaUrl(article.featuredImage)
    const section = article.category?.name ? String(article.category.name) : null
    const tags = (Array.isArray(article.tags) ? article.tags : [])
      .map((tag) => String(tag).replace(/^#/, '').trim())
      .filter(Boolean)
      .slice(0, 5)
    return [
      '    <item>',
      `      <title>${escape(article.title)}</title>`,
      `      <link>${escape(url)}</link>`,
      `      <guid isPermaLink="true">${escape(url)}</guid>`,
      article.summary ? `      <description>${escape(article.summary)}</description>` : null,
      stamp ? `      <pubDate>${stamp}</pubDate>` : null,
      article.author?.fullName ? `      <dc:creator>${escape(article.author.fullName)}</dc:creator>` : null,
      section ? `      <category>${escape(section)}</category>` : null,
      ...tags.map((tag) => `      <category>${escape(tag)}</category>`),
      image ? `      <media:content url="${escape(image)}" medium="image" />` : null,
      '    </item>',
    ].filter(Boolean).join('\n')
  })

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>${escape(SITE_NAME)}</title>
    <link>${escape(SITE_URL)}</link>
    <description>${escape(SITE_DESCRIPTION)}</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <docs>https://www.rss.org/rss.xml</docs>
    <generator>RADAR build scripts</generator>
    <atom:link href="${escape(`${SITE_URL}/feed.xml`)}" rel="self" type="application/rss+xml" />
    <image>
      <url>${escape(`${SITE_URL}/icons/icon-192x192.png`)}</url>
      <title>${escape(SITE_NAME)}</title>
      <link>${escape(SITE_URL)}</link>
    </image>
${entries.join('\n')}
  </channel>
</rss>
`
}

// Google News reads one sitemap per publication language and only the last two
// days of it, so the file stays small and is rewritten on every build. The
// publication declares itself in English - the language every story is filed as
// in the database - so a Kinyarwanda-only News listing would need its own
// publication in Search Console and its own file.
const NEWS_WINDOW_MS = 2 * 24 * 60 * 60 * 1000

function newsSitemap(items) {
  const recent = items.filter((article) => {
    const stamp = publishedStamp(article)
    if (!article.slug || !stamp) return false
    // Paid content is not a news report, and a Google News listing is a claim
    // that it is one. The story stays on the site, labelled; it just is not
    // filed as news.
    if (article.isSponsored) return false
    return Date.now() - new Date(stamp).getTime() <= NEWS_WINDOW_MS
  }).slice(0, 1000)

  const entries = recent.map((article) => {
    const keywords = (Array.isArray(article.tags) ? article.tags : [])
      .map((tag) => String(tag).replace(/^#/, '').trim())
      .filter(Boolean)
    if (article.category?.name) keywords.unshift(String(article.category.name))
    return [
      '  <url>',
      `    <loc>${escape(articleUrl(article))}</loc>`,
      '    <news:news>',
      '      <news:publication>',
      `        <news:name>${escape(SITE_NAME)}</news:name>`,
      '        <news:language>en</news:language>',
      '      </news:publication>',
      `      <news:publication_date>${isoStamp(publishedStamp(article))}</news:publication_date>`,
      `      <news:title>${escape(article.title)}</news:title>`,
      keywords.length ? `      <news:keywords>${escape(keywords.slice(0, 8).join(', '))}</news:keywords>` : null,
      '    </news:news>',
      '  </url>',
    ].filter(Boolean).join('\n')
  })

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${entries.join('\n')}
</urlset>
`
  return { xml, count: recent.length }
}

// Google's image sitemap: each picture tied to the page it belongs to, so an image
// search sends a reader to the story rather than to a bare file. The newsroom stores
// one photo per story, so this is one <image:image> per <url>.
//
// The caption is written only when someone recorded a credit. A description invented
// for a photograph is how a picture search starts lying about what is in it.
//
// The cap is not one the archive has come near; it is Google's own ceiling, applied
// so that the day it matters the answer is visibly to split the file rather than to
// leave a crawler with a silently truncated one. Newest first, so what a picture
// search would actually serve is what stays.
const IMAGE_SITEMAP_LIMIT = 1000

function imageSitemap(items) {
  const entries = []
  for (const article of items) {
    if (entries.length >= IMAGE_SITEMAP_LIMIT) break
    if (!article?.slug) continue
    const image = mediaUrl(article.featuredImage)
    if (!image) continue
    entries.push([
      '  <url>',
      `    <loc>${escape(articleUrl(article))}</loc>`,
      '    <image:image>',
      `      <image:loc>${escape(image)}</image:loc>`,
      article.title ? `      <image:title>${escape(article.title)}</image:title>` : null,
      article.imageCredit ? `      <image:caption>${escape(String(article.imageCredit))}</image:caption>` : null,
      '    </image:image>',
      '  </url>',
    ].filter(Boolean).join('\n'))
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries.join('\n')}
</urlset>
`
  return { xml, count: entries.length }
}


function articlesFromExistingSitemap() {
  const sitemapPath = path.join(root, 'public', 'sitemap-articles.xml')
  if (!fs.existsSync(sitemapPath)) return []
  const xml = fs.readFileSync(sitemapPath, 'utf8')
  return [...xml.matchAll(/<loc>https:\/\/www\.radartimes\.2bd\.net\/article\/([^<]+)<\/loc>/g)]
    .slice(0, 48)
    .map((match) => {
      const slug = match[1]
      const title = slug
        .replace(/-\d{10,}$/, '')
        .split('-')
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
      return { slug, title }
    })
}

async function main() {
  const base = apiBase()
  const today = isoDate(new Date().toISOString())

  let articles = []
  let categories = []
  let articlesUnread = false
  for (let attempt = 1; attempt <= 3 && articlesUnread !== true; attempt += 1) {
    try {
      articles = await publishedArticles(base)
    } catch (error) {
      // A sleeping server or one slow page is not a reason to give up on the
      // whole list, and it is certainly not a reason to publish an empty one.
      if (attempt === 3) {
        articlesUnread = true
        console.warn(`sitemap: could not read articles from ${base} (${error.message})`)
      } else {
        await new Promise((done) => setTimeout(done, attempt * 3000))
      }
    }
  }
  if (articlesUnread) {
    // Nothing is rewritten. A server that did not answer in time is not news
    // about the stories, and overwriting the article list with an empty one
    // would tell a search engine that the newsroom went quiet the day it was
    // busiest. The files already in public/ stay live; run `npm run sitemap`
    // again once the API answers.
    console.warn('sitemap: keeping the files already in public/, none were rewritten')
    // Render crawlable landing pages from the last known-good sitemap when the
    // free backend is asleep. Never replace a populated sitemap with an empty one.
    const fallbackArticles = articlesFromExistingSitemap()
    writePrerenderedLandingPages(fallbackArticles)
    console.log('sitemap: landing pages used ' + fallbackArticles.length + ' last-known-good article URLs')
    return
  }
  writePrerenderedArticles(articles)
  writePrerenderedLandingPages(articles)
  try {
    categories = (await json(`${base}/categories`))?.categories ?? []
  } catch (error) {
    console.warn(`sitemap: could not read categories (${error.message})`)
  }
  let sections = []
  try {
    sections = (await json(`${base}/sections`))?.sections ?? []
  } catch (error) {
    console.warn(`sitemap: could not read the section tree (${error.message}); falling back to category feeds`)
  }

  // Every spelling the tree already claims, so a topic never appears twice.
  const sectionSpellings = new Set()
  const sectionHrefs = []
  const collect = (node, href) => {
    sectionHrefs.push(href)
    ;[node.slug, ...(node.aliases || [])].forEach((value) => sectionSpellings.add(String(value).toLowerCase()))
    ;(node.children || []).forEach((child) => collect(child, child.href || `${href}/${child.slug}`))
  }
  sections.forEach((section) => collect(section, section.href || `/${section.slug}`))

  const latestArticle = articles
    .map((a) => isoDate(a.publishedAt || a.createdAt))
    .filter(Boolean)
    .sort()
    .pop() || today

  const files = []

  // The newsroom pages advertisers and readers look for before trusting a site.
  const publisherPages = [
    'about',
    'contact',
    'editorial-policy',
    'corrections',
    'advertising',
    'privacy',
    'cookies',
    'disclaimer',
    'terms',
  ]

  files.push({
    name: 'sitemap-pages.xml',
    xml: urlset([
      urlEntry(`${SITE_URL}/`, today, '1.0', 'daily'),
      urlEntry(`${SITE_URL}/articles`, today, '0.9', 'hourly'),
      urlEntry(`${SITE_URL}/global-news`, today, '0.8', 'hourly'),
      urlEntry(`${SITE_URL}/categories`, today, '0.7', 'daily'),
      // The authors directory. It is the page that answers "who writes here",
      // and it changes whenever a byline publishes, so daily rather than yearly.
      urlEntry(`${SITE_URL}/authors`, latestArticle, '0.7', 'daily'),
      urlEntry(`${SITE_URL}/live`, today, '0.8', 'hourly'),
      // The scores desk is the page a search engine is most likely to be asked
      // about on a Saturday, so it is offered hourly rather than daily and its
      // lastmod moves with the build - a stale date on a live page tells the
      // crawler the thing is not being looked after.
      urlEntry(`${SITE_URL}/live-sports`, today, '0.9', 'hourly'),
      ...publisherPages.map((slug) => urlEntry(`${SITE_URL}/${slug}`, today, '0.4', 'yearly')),
    ]),
  })

  files.push({
    name: 'sitemap-articles.xml',
    xml: urlset(
      articles
        .filter((a) => a?.slug)
        .map((a) => urlEntry(`${SITE_URL}/article/${a.slug}`, isoDate(a.publishedAt || a.createdAt), '0.8', 'weekly'))
    ),
  })

  if (sectionHrefs.length) {
    files.push({
      name: 'sitemap-sections.xml',
      xml: urlset(
        sectionHrefs.map((href) => urlEntry(`${SITE_URL}${href}`, latestArticle, '0.7', 'daily'))
      ),
    })
  }

  // A topic outside the published tree keeps its own /category page; the ones the
  // tree covers are already listed above at their canonical address.
  files.push({
    name: 'sitemap-categories.xml',
    xml: urlset(
      categories
        .filter((c) => c?.slug && !sectionSpellings.has(String(c.slug).toLowerCase()))
        .map((c) => urlEntry(`${SITE_URL}/category/${c.slug}`, latestArticle, '0.6', 'daily'))
    ),
  })

  // One profile page per author that has something published.
  const authors = new Map()
  for (const article of articles) {
    const id = article?.author?._id
    if (!id) continue
    const stamp = isoDate(article.publishedAt || article.createdAt)
    if (!authors.has(id) || (stamp && stamp > authors.get(id))) authors.set(id, stamp)
  }
  files.push({
    name: 'sitemap-writers.xml',
    xml: urlset(
      [...authors.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, lastmod]) => urlEntry(`${SITE_URL}/user/${id}`, lastmod, '0.5', 'weekly'))
    ),
  })

  // Newest first, because both the feed and the News sitemap lead with them.
  const newest = byNewest(articles.filter((a) => a?.slug))
  const news = newsSitemap(newest)
  // Keep both specialized sitemap endpoints present even on quiet days. The News
  // sitemap is valid with an empty urlset; this prevents robots.txt or Search
  // Console from being sent to a stale file left over from an earlier build.
  files.push({ name: 'sitemap-news.xml', xml: news.xml })
  const images = imageSitemap(newest)
  files.push({ name: 'sitemap-images.xml', xml: images.xml })
  const feedUrl = write('feed.xml', rssFeed(newest))

  const written = files.map((file) => ({ name: file.name, url: write(file.name, file.xml) }))

  const index = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${written
  .map(({ name }) => {
    const lastmod = name === 'sitemap-articles.xml' || name === 'sitemap-pages.xml' || name === 'sitemap-images.xml' ? latestArticle : null
    return ['  <sitemap>', `    <loc>${escape(`${SITE_URL}/${name}`)}</loc>`, lastmod ? `    <lastmod>${lastmod}</lastmod>` : null, '  </sitemap>']
      .filter(Boolean)
      .join('\n')
  })
  .join('\n')}
</sitemapindex>
`
  const indexUrl = write('sitemap.xml', index)

  console.log(`sitemap index:     ${indexUrl}`)
  for (const { url } of written) console.log(`  -> ${url}`)
  console.log(`  -> ${feedUrl}`)
  console.log(
    `${articles.length} articles, ${categories.length} categories, ${sectionHrefs.length} section pages, ${authors.size} writers, ` +
      // Home, News, Categories, Authors, TV, the scores desk and Search - the seven
      // addresses the site publishes that are not a story, a section or a policy page.
      `${8 + publisherPages.length} static pages, ${news.count} stories in the News sitemap, ` +
      `${images.count} pictures in the image sitemap, ` +
      `${Math.min(newest.length, 30)} stories in the feed`
  )
}

main().catch((error) => {
  console.error('sitemap generation failed:', error.message)
  process.exit(1)
})
