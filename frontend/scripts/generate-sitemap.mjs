// Writes public/sitemap.xml from the live API so every published story and
// category is listed as its own URL. Runs automatically before `npm run build`;
// re-run it after publishing news that must be indexed sooner.
//   cd frontend && npm run sitemap
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

async function main() {
  const base = apiBase()
  const entries = [
    urlEntry(`${SITE_URL}/`, isoDate(new Date().toISOString()), '1.0', 'daily'),
    urlEntry(`${SITE_URL}/articles`, isoDate(new Date().toISOString()), '0.9', 'hourly'),
    urlEntry(`${SITE_URL}/categories`, null, '0.7', 'daily'),
    urlEntry(`${SITE_URL}/search`, null, '0.4', 'monthly'),
  ]

  let articleCount = 0
  let categoryCount = 0
  try {
    const articles = await publishedArticles(base)
    articleCount = articles.length
    for (const article of articles) {
      if (!article?.slug) continue
      entries.push(urlEntry(`${SITE_URL}/article/${article.slug}`, isoDate(article.publishedAt || article.createdAt), '0.8', 'weekly'))
    }
  } catch (error) {
    console.warn(`sitemap: could not read articles from ${base} (${error.message}); writing static routes only`)
  }

  try {
    const categories = (await json(`${base}/categories`))?.categories ?? []
    categoryCount = categories.length
    for (const category of categories) {
      if (!category?.slug) continue
      entries.push(urlEntry(`${SITE_URL}/category/${category.slug}`, null, '0.6', 'daily'))
    }
  } catch (error) {
    console.warn(`sitemap: could not read categories (${error.message})`)
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>
`
  fs.writeFileSync(path.join(root, 'public', 'sitemap.xml'), xml)
  console.log(`sitemap.xml: ${entries.length} URLs (${articleCount} articles, ${categoryCount} categories)`)
}

main().catch((error) => {
  console.error('sitemap generation failed:', error.message)
  process.exit(1)
})
