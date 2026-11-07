import { useState } from 'react'
import { resolveMediaUrl } from '../../services/apiClient'

interface AvatarProps {
  src?: string | null
  name?: string | null
  className?: string
  textClassName?: string
}

// Tracks the URL it failed on rather than a boolean, so a freshly uploaded
// avatar still renders after an earlier one 404s.
export default function Avatar({ src, name, className = 'h-8 w-8', textClassName = '' }: AvatarProps) {
  const url = resolveMediaUrl(src)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  return (
    <div className={`flex items-center justify-center overflow-hidden rounded-full ${className}`}>
      {url && failedUrl !== url ? (
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <span className={textClassName}>{(name?.trim()?.[0] || 'U').toUpperCase()}</span>
      )}
    </div>
  )
}
