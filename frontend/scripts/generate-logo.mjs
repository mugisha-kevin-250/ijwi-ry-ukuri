// Regenerates the RADAR brand mark as transparent PNGs that `npm run icons`
// then rasterises into every PWA icon and favicon.
//   cd frontend && npm run logo && npm run icons
// The geometry is the same one RadarLogo.tsx draws in the header, so the
// animated mark on the page and the static mark on a phone launcher are the
// same picture rather than two interpretations of it.
//
// Two cuts are written: the full mark for anything 180px and above, and a
// compact one for the favicons. At 16px the inner ring, the trail and the
// second contact stop being detail and start being blur, so they are dropped
// and what is left is drawn bolder.
import Jimp from 'jimp'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// White on the launcher's brand blue: generate-icons.mjs composites the
// artwork onto BRAND_BLUE, so nothing here may be blue itself.
const WHITE = [255, 255, 255]
const BLIP = [125, 211, 252]

// The sweep is frozen where the animation reads best: leading edge at
// forty-five degrees, trail fanning back to twelve o'clock.
const LEADING = -Math.PI / 4
const TRAIL = -Math.PI / 2

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

function render(size, compact) {
  const centre = size / 2
  const radius = centre - size * 0.0625
  const ringWidth = size * (compact ? 0.055 : 0.03125)
  const lineWidth = size * (compact ? 0.075 : 0.045)
  const blipRadius = size * (compact ? 0.07 : 0.055)
  const coreRadius = size * 0.05
  const image = new Jimp(size, size, 0x00000000)
  const data = image.bitmap.data

  const tipX = radius * Math.cos(LEADING)
  const tipY = radius * Math.sin(LEADING)

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5 - centre
      const py = y + 0.5 - centre
      const d = Math.hypot(px, py)
      if (d > radius + ringWidth) continue

      const arcToTrail = d * (Math.atan2(py, px) - TRAIL)
      const arcToLeading = d * (LEADING - Math.atan2(py, px))
      const sweep = Math.hypot(px - tipX * clamp01((px * tipX + py * tipY) / (radius * radius)), py - tipY * clamp01((px * tipX + py * tipY) / (radius * radius)))

      const layers = [
        { rgb: WHITE, a: clamp01(radius + 0.5 - d) * (compact ? 0.34 : 0.14) },
        { rgb: WHITE, a: clamp01(ringWidth / 2 + 0.5 - Math.abs(d - radius)) * 0.85 },
      ]
      if (!compact) {
        layers.push({ rgb: WHITE, a: clamp01(ringWidth / 2 + 0.5 - Math.abs(d - radius * 0.55)) * 0.82 })
        layers.push({
          rgb: WHITE,
          a: arcToTrail > 0 && arcToLeading > 0
            ? clamp01(radius + 0.5 - d) * clamp01(Math.min(arcToTrail, arcToLeading) + 0.5) * 0.3
            : 0,
        })
      }
      layers.push({ rgb: WHITE, a: clamp01(lineWidth / 2 + 0.5 - sweep) * 0.95 })
      layers.push({ rgb: BLIP, a: clamp01(blipRadius + 0.5 - Math.hypot(px - radius * 0.42, py + radius * 0.5)) * 0.95 })
      if (!compact) {
        layers.push({ rgb: BLIP, a: clamp01(blipRadius + 0.5 - Math.hypot(px + radius * 0.55, py - radius * 0.35)) * 0.5 })
      }
      layers.push({ rgb: WHITE, a: clamp01(coreRadius + 0.5 - d) })

      let pr = 0
      let pg = 0
      let pb = 0
      let pa = 0
      for (const layer of layers) {
        if (layer.a <= 0) continue
        const over = layer.a * (1 - pa)
        pr += layer.rgb[0] * over
        pg += layer.rgb[1] * over
        pb += layer.rgb[2] * over
        pa += over
      }
      if (pa <= 0) continue

      const i = (y * size + x) * 4
      data[i] = Math.round(pr / pa)
      data[i + 1] = Math.round(pg / pa)
      data[i + 2] = Math.round(pb / pa)
      data[i + 3] = Math.round(pa * 255)
    }
  }

  return image
}

async function main() {
  const full = path.join(root, 'Logo.png')
  const compact = path.join(root, 'Logo-compact.png')
  await render(1024, false).writeAsync(full)
  await render(192, true).writeAsync(compact)
  fs.copyFileSync(full, path.join(root, 'public', 'logo.png'))
  console.log('wrote Logo.png (1024), Logo-compact.png (192) and public/logo.png')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
