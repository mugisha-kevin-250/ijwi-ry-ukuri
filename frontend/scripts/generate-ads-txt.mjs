// Writes public/ads.txt from the AdSense publisher id in the build environment.
// Google only serves ads on a domain whose ads.txt names that publisher, and the
// id belongs to the owner, so the file is generated at build time instead of
// being committed. Without an id no file is written and the site shows no ads.
//   cd frontend && npm run ads-txt     (runs automatically before `npm run build`)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, 'public', 'ads.txt')

function envValue(name) {
  if (process.env[name]) return process.env[name].trim()
  for (const file of ['.env.production', '.env.local', '.env']) {
    const location = path.join(root, file)
    if (!fs.existsSync(location)) continue
    const match = fs.readFileSync(location, 'utf8').match(new RegExp(`^${name}=(.+)$`, 'm'))
    if (match) return match[1].trim()
  }
  return ''
}

const publisher = envValue('VITE_ADSENSE_PUB_ID') || envValue('ADSENSE_PUB_ID')

if (!publisher) {
  if (fs.existsSync(target)) fs.rmSync(target)
  console.log('ads.txt: no publisher id set, so the site will serve no ads.')
  process.exit(0)
}

// An ads.txt with a broken id tells Google the site is not really approved, so a
// typo is safer reported than written.
if (!/^pub-\d{16}$/.test(publisher)) {
  console.warn('ads.txt: the publisher id is not pub-XXXXXXXXXXXXXXXX, so nothing was written.')
  process.exit(0)
}

// f08c47fec0942fa0 is Google's own certification id for its AdSense crawler.
fs.writeFileSync(target, `google.com, ${publisher}, DIRECT, f08c47fec0942fa0\n`, 'utf8')
console.log(`ads.txt: written for ${publisher.slice(0, 4)}…${publisher.slice(-4)}`)
