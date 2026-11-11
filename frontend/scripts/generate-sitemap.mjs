// Writes the sitemap set into public/ from the live API, one file per kind of
// content, plus a sitemap index at public/sitemap.xml:
//   sitemap.xml              index  -> lists every file below
//   sitemap-pages.xml        static pages (home, all articles, categories, live,
//                            search, and the newsroom pages: about, contact,
//                            editorial-policy, corrections, advertising, privacy, terms)
//   sitemap-articles.xml     one URL per published story
//   sitemap-categories.xml   one URL per category feed
//   sitemap-writers.xml      one URL per author profile page
//   sitemap-news.xml         Google News sitemap: English stories from the last
//                            two days (Google only reads that window)
//   feed.xml                 RSS 2.0 feed of the latest 30 published stories
// Runs automatically before `npm run build`; re-run it after publishing news that
// must be indexed sooner:  cd frontend && npm run sitemap
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE_URL = 'https://ijwi-ry--ukuri.web.app'
const SITE_NAME = "Ijwi ry'ukuri"
const SITE_DESCRIPTION = 'Rwandan news written by approved writers: politics, business, technology, sports, culture and health.'
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
    <generator>Ijwi ry'ukuri build scripts</generator>
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

async function main() {
  const base = apiBase()
  const today = isoDate(new Date().toISOString())

  let articles = []
  let categories = []
  try {
    articles = await publishedArticles(base)
  } catch (error) {
    console.warn(`sitemap: could not read articles from ${base} (${error.message}); writing static routes only`)
  }
  try {
    categories = (await json(`${base}/categories`))?.categories ?? []
  } catch (error) {
    console.warn(`sitemap: could not read categories (${error.message})`)
  }

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
    'terms',
  ]

  files.push({
    name: 'sitemap-pages.xml',
    xml: urlset([
      urlEntry(`${SITE_URL}/`, today, '1.0', 'daily'),
      urlEntry(`${SITE_URL}/articles`, today, '0.9', 'hourly'),
      urlEntry(`${SITE_URL}/categories`, today, '0.7', 'daily'),
      urlEntry(`${SITE_URL}/live`, today, '0.8', 'hourly'),
      urlEntry(`${SITE_URL}/search`, null, '0.4', 'monthly'),
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

  files.push({
    name: 'sitemap-categories.xml',
    xml: urlset(
      categories
        .filter((c) => c?.slug)
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
  if (news.count) files.push({ name: 'sitemap-news.xml', xml: news.xml })
  const feedUrl = write('feed.xml', rssFeed(newest))

  const written = files.map((file) => ({ name: file.name, url: write(file.name, file.xml) }))

  const index = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${written
  .map(({ name }) => {
    const lastmod = name === 'sitemap-articles.xml' || name === 'sitemap-pages.xml' ? latestArticle : null
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
    `${articles.length} articles, ${categories.length} categories, ${authors.size} writers, ` +
      `${5 + publisherPages.length} static pages, ${news.count} stories in the News sitemap, ` +
      `${Math.min(newest.length, 30)} stories in the feed`
  )
}

main().catch((error) => {
  console.error('sitemap generation failed:', error.message)
  process.exit(1)
})
