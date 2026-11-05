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
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
