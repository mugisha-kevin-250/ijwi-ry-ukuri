// Writes the sitemap set into public/ from the live API, one file per kind of
// content, plus a sitemap index at public/sitemap.xml:
//   sitemap.xml              index  -> lists every file below
//   sitemap-pages.xml        static pages (home, all articles, categories, search)
//   sitemap-articles.xml     one URL per published story
//   sitemap-categories.xml   one URL per category feed
//   sitemap-writers.xml      one URL per author profile page
// Runs automatically before `npm run build`; re-run it after publishing news that
// must be indexed sooner:  cd frontend && npm run sitemap
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE_URL = 'https://ijwi-ry--ukuri.web.app'
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

const escape = (value) => String(value).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c])

function isoDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
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

  files.push({
    name: 'sitemap-pages.xml',
    xml: urlset([
      urlEntry(`${SITE_URL}/`, today, '1.0', 'daily'),
      urlEntry(`${SITE_URL}/articles`, today, '0.9', 'hourly'),
      urlEntry(`${SITE_URL}/categories`, today, '0.7', 'daily'),
      urlEntry(`${SITE_URL}/search`, null, '0.4', 'monthly'),
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
  console.log(
    `${articles.length} articles, ${categories.length} categories, ${authors.size} writers, 4 static pages`
  )
}

main().catch((error) => {
  console.error('sitemap generation failed:', error.message)
  process.exit(1)
})
