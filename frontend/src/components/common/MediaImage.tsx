import { useState, type ImgHTMLAttributes } from 'react'
import { resolveMediaUrl, PLACEHOLDER_IMAGE } from '../../services/apiClient'

interface MediaImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src?: string | null
}

// Reads take media as backend-relative /uploads paths, cached rows can still
// point at files that no longer exist, and the API origin differs from the
// hosting origin — so every image resolves and falls back in one place.
export default function MediaImage({ src, alt = '', ...rest }: MediaImageProps) {
  const url = resolveMediaUrl(src)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  if (!url) return null

  return (
    <img
      {...rest}
      src={failedUrl === url ? PLACEHOLDER_IMAGE : url}
      alt={alt}
      onError={() => setFailedUrl(url)}
    />
  )
}
