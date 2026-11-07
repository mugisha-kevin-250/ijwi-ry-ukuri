const MAX_LONG_EDGE = 3840
const FALLBACK_LONG_EDGES = [2560, 1920, 1280]
// The backend rejects anything past 5 MB, so the encoder keeps stepping down.
const MAX_UPLOAD_BYTES = 4.5 * 1024 * 1024
const QUALITIES = [0.92, 0.85, 0.75, 0.65]

interface DecodedImage {
  width: number
  height: number
  draw: (context: CanvasRenderingContext2D, width: number, height: number) => void
  close: () => void
}

async function decode(file: File): Promise<DecodedImage> {
  if ('createImageBitmap' in window) {
    const bitmap = await createImageBitmap(file)
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (context, width, height) => context.drawImage(bitmap, 0, 0, width, height),
      close: () => bitmap.close(),
    }
  }

  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('The image could not be read'))
      image.src = url
    })
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      draw: (context, width, height) => context.drawImage(image, 0, 0, width, height),
      close: () => URL.revokeObjectURL(url),
    }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The image could not be encoded'))),
      type,
      quality,
    )
  })
}

/**
 * Readers scroll through banners and story photos on phones and TVs alike, so a
 * picture is re-rendered at up to 4K before it leaves the browser: big enough to
 * stay sharp on a large screen, small enough to survive the 5 MB upload limit.
 */
export async function normalizeImage(file: File): Promise<File> {
  // Animated gifs and vector art lose everything if they are flattened.
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.type === 'image/gif') return file

  const image = await decode(file)
  try {
    const longEdge = Math.max(image.width, image.height)
    if (longEdge <= MAX_LONG_EDGE && file.size <= MAX_UPLOAD_BYTES) return file

    const preferredType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    for (const edge of [MAX_LONG_EDGE, ...FALLBACK_LONG_EDGES]) {
      const scale = Math.min(1, edge / longEdge)
      if (!scale) continue
      const width = Math.max(1, Math.round(image.width * scale))
      const height = Math.max(1, Math.round(image.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) return file
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      // JPEG has no alpha, so transparent pngs get a page-coloured backing.
      if (preferredType === 'image/jpeg') {
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, width, height)
      }
      image.draw(context, width, height)

      for (const type of preferredType === 'image/png' ? ['image/png', 'image/jpeg'] : ['image/jpeg']) {
        for (const quality of type === 'image/jpeg' ? QUALITIES : [1]) {
          const blob = await encode(canvas, type, quality)
          if (blob.size <= MAX_UPLOAD_BYTES) {
            const name = `${file.name.replace(/\.[^./]+$/, '') || 'image'}.${type === 'image/png' ? 'png' : 'jpg'}`
            return new File([blob], name, { type, lastModified: file.lastModified })
          }
        }
      }
      // Still too heavy at this size: step down and try again.
    }
    return file
  } finally {
    image.close()
  }
}
