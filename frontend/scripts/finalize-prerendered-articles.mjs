import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const builtIndexPath = path.join(dist, 'index.html')
const contentRoots = [path.join(dist, 'article'), path.join(dist, 'articles')]

if (!fs.existsSync(builtIndexPath)) {
  throw new Error('Production index.html is missing; cannot finalize prerendered articles')
}

if (!contentRoots.some((directory) => fs.existsSync(directory))) {
  console.log('No prerendered public pages to finalize')
  process.exit(0)
}

const builtIndex = fs.readFileSync(builtIndexPath, 'utf8')
const moduleScript = builtIndex.match(/<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["']\/assets\/)[^>]*>\s*<\/script>/i)?.[0]

if (!moduleScript) {
  throw new Error('Could not find the compiled Vite module script in dist/index.html')
}

const assetLinks = [...builtIndex.matchAll(/<link\b(?=[^>]*\bhref=["']\/assets\/)[^>]*>/gi)]
  .map((match) => match[0])
  .join('\n    ')

if (!assetLinks) {
  throw new Error('Could not find compiled Vite asset links in dist/index.html')
}

function walk(directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(target) : entry.isFile() && entry.name === 'index.html' ? [target] : []
  })
}

const pages = contentRoots.flatMap((directory) => walk(directory))
let finalized = 0

for (const pagePath of pages) {
  let html = fs.readFileSync(pagePath, 'utf8')

  if (!/\bsrc=["']\/src\/main\.tsx["']/.test(html)) {
    if (/\bsrc=["']\/assets\//.test(html)) continue
    throw new Error('Unexpected script entry point in ' + path.relative(dist, pagePath))
  }

  html = html.replace(
    /<script\b(?=[^>]*\bsrc=["']\/src\/main\.tsx["'])[^>]*>\s*<\/script>/i,
    moduleScript,
  )
  html = html.replace('</head>', '    ' + assetLinks + '\n  </head>')

  if (/\bsrc=["']\/src\/main\.tsx["']/.test(html)) {
    throw new Error('Development entry point remains in ' + path.relative(dist, pagePath))
  }

  fs.writeFileSync(pagePath, html)
  finalized += 1
}

console.log('SEO prerender: attached production Vite assets to ' + finalized + ' prerendered public pages')
