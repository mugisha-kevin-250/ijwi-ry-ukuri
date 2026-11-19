import { resolveMediaUrl } from '../../services/apiClient'

interface Props {
  /** 'youtube' | 'vimeo' | 'file' as the server classified the link. */
  source?: string
  /** The address the page is allowed to load, rebuilt server-side. */
  embedUrl?: string
  /** What the author pasted or uploaded, used when no embed was stored. */
  videoUrl?: string
  title: string
}

/**
 * The clip an author attached to a story.
 *
 * Two players, chosen by what the video actually is: a file this site holds
 * plays in the browser's own <video>, and a YouTube or Vimeo picture is loaded
 * by an iframe because a browser cannot mix the two. The address comes from the
 * API, which built it from the video id rather than trusting the text somebody
 * pasted, so nothing here decides what gets embedded.
 *
 * It stays silent until the reader presses play - a news page that starts a
 * video, and the data bill that comes with it, over the headline is the reader's
 * business, not the page's.
 */
export default function StoryVideo({ source, embedUrl, videoUrl, title }: Props) {
  const address = (embedUrl || videoUrl || '').trim()
  if (!address) return null

  if (source === 'file') {
    return (
      <video
        src={resolveMediaUrl(address)}
        controls
        playsInline
        preload="metadata"
        className="aspect-video w-full rounded-xl bg-black"
      />
    )
  }

  return (
    <iframe
      src={resolveMediaUrl(address)}
      title={title}
      loading="lazy"
      className="aspect-video w-full rounded-xl border-0 bg-black"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
    />
  )
}
