import { resolveMediaUrl } from '../../services/apiClient'
import { useI18n } from '../../context/I18nContext'

interface Props {
  /** 'youtube' | 'vimeo' | 'facebook' | 'instagram' | 'tiktok' | 'file' | 'link' as the server classified it. */
  source?: string
  /** The address the page is allowed to load, rebuilt server-side. */
  embedUrl?: string
  /** What the author pasted or uploaded, used when no embed was stored. */
  videoUrl?: string
  title: string
}

/** What a reader is being sent to, named from the address rather than trusted text. */
export function platformOf(address: string): string {
  const host = address.replace(/^[a-z]+:\/\//i, '').split('/')[0].toLowerCase()
  if (host.includes('youtube')) return 'YouTube'
  if (host.includes('vimeo')) return 'Vimeo'
  if (host.includes('facebook') || host === 'fb.watch' || host.includes('fb.com')) return 'Facebook'
  if (host.includes('instagram')) return 'Instagram'
  if (host.includes('tiktok')) return 'TikTok'
  if (host.includes('x.com') || host.includes('twitter')) return 'X'
  return host.split('.').slice(-2)[0] || 'the source'
}

/**
 * A clip from a platform this site has no player for.
 *
 * The author attached it, so it belongs on the story: rather than a black box
 * that will not load, the reader gets one honest card that opens the video on
 * the platform's own page in a new tab. rel=noopener keeps the reader's session
 * off the address they are leaving for, and nofollow says the newsroom is not
 * endorsing whatever else is on that page.
 */
export function VideoLinkCard({ address, label }: { address: string; label?: string }) {
  const { t } = useI18n()
  const platform = platformOf(address)
  return (
    <a
      href={resolveMediaUrl(address)}
      target="_blank"
      rel="noopener nofollow noreferrer"
      className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm transition hover:border-brand-300 hover:bg-brand-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-blue-700 dark:hover:bg-blue-950/40"
    >
      <span className="min-w-0">
        <span className="block text-sm font-bold text-gray-900 dark:text-white">{label || `${t('video.watchOn')} ${platform}`}</span>
        <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">{platform}</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-bold text-white">
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
        {platform}
      </span>
    </a>
  )
}

/**
 * The clip an author attached to a story.
 *
 * Three players, chosen by what the video actually is: a file this site holds
 * plays in the browser's own <video>; a YouTube, Vimeo, Facebook, Instagram or
 * TikTok picture is loaded by an iframe, because a browser cannot mix the two;
 * and a link from a platform the site has no player for becomes one card that
 * opens it where it lives. The address comes from the API, which built the
 * embed from the video id rather than trusting the text somebody pasted, so
 * nothing here decides what gets embedded.
 *
 * It stays silent until the reader presses play - a news page that starts a
 * video, and the data bill that comes with it, over the headline is the reader's
 * business, not the page's.
 */
export default function StoryVideo({ source, embedUrl, videoUrl, title }: Props) {
  const address = (embedUrl || videoUrl || '').trim()
  const pasted = (videoUrl || '').trim()
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

  // No embed was written for it, so the platform has no player here. The card
  // needs the address the author pasted, never the embed field.
  if (source === 'link' || !embedUrl) {
    return <VideoLinkCard address={pasted || address} />
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
