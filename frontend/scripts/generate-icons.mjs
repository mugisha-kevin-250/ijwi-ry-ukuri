// Regenerates every PWA icon and favicon from Logo.png.
//   cd frontend && npm run icons
// Edit the logo, re-run, then rebuild and redeploy the frontend.
import Jimp from 'jimp'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'Logo.png')
const iconsDir = path.join(root, 'public', 'icons')
const publicDir = path.join(root, 'public')

const BRAND_BLUE = 0x1877f2ff

function write(image, file) {
  return image.writeAsync(file).then(() => console.log(`wrote ${path.relative(root, file)}`))
}

function fit(image, size, padding = 0) {
  const target = size - padding * 2
  return image.clone().resize(target, target).background(BRAND_BLUE).contain(size, size, Jimp.HORIZONTAL_ALIGN_CENTER | Jimp.VERTICAL_ALIGN_CENTER)
}

// Google and older browsers still request /favicon.ico directly. An .ico file may
// carry plain PNG payloads, so the generated favicons are wrapped without re-encoding.
function icoFrom(entries) {
  const header = Buffer.alloc(6 + entries.length * 16)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(entries.length, 4)
  let offset = header.length
  const parts = entries.map(({ size, buffer }, index) => {
    const base = 6 + index * 16
    header.writeUInt8(size >= 256 ? 0 : size, base)
    header.writeUInt8(size >= 256 ? 0 : size, base + 1)
    header.writeUInt16LE(1, base + 4) // colour planes
    header.writeUInt16LE(32, base + 6) // bits per pixel
    header.writeUInt32LE(buffer.length, base + 8)
    header.writeUInt32LE(offset, base + 12)
    offset += buffer.length
    return buffer
  })
  return Buffer.concat([header, ...parts])
}

async function main() {
  if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true })

  const logo = await Jimp.read(source)
  console.log(`source logo: ${logo.getWidth()}x${logo.getHeight()}`)

  // The logo is square with transparent margins, so a solid blue backdrop keeps
  // it readable on both light and dark launchers.
  const transparent = logo.getPixelColor(0, 0) % 256 === 0

  const tasks = [
    write(fit(logo, 192, transparent ? 12 : 0), path.join(iconsDir, 'icon-192x192.png')),
    write(fit(logo, 512, transparent ? 32 : 0), path.join(iconsDir, 'icon-512x512.png')),
    // Maskable icons need the artwork inside the 80% safe zone of a 512 canvas.
    write(fit(logo, 512, 96), path.join(iconsDir, 'icon-maskable-512x512.png')),
    write(fit(logo, 180, transparent ? 10 : 0), path.join(iconsDir, 'apple-touch-icon.png')),
    write(fit(logo, 48, transparent ? 2 : 0), path.join(publicDir, 'favicon-48x48.png')),
    write(fit(logo, 32, transparent ? 2 : 0), path.join(publicDir, 'favicon-32x32.png')),
    write(fit(logo, 16), path.join(publicDir, 'favicon-16x16.png')),
  ]

  await Promise.all(tasks)

  const ico = icoFrom([16, 32, 48].map((size) => ({
    size,
    buffer: fs.readFileSync(path.join(publicDir, `favicon-${size}x${size}.png`)),
  })))
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), ico)
  console.log(`wrote ${path.relative(root, path.join(publicDir, 'favicon.ico'))} (${ico.length} bytes)`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
