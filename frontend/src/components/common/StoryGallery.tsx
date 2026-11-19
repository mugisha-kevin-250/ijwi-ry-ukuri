import MediaImage from './MediaImage'
import StoryVideo from './StoryVideo'
import { useI18n } from '../../context/I18nContext'
import type { StoryMedia } from '../../types'

interface Props {
  /** The list the author assembled, in the order they put it. */
  items?: StoryMedia[]
  /** The story headline, used as the description of a picture that has none. */
  title?: string
}

/**
 * The pictures and clips a story carries after the one at the top.
 *
 * Nothing here decides what is loadable: the server already read every address
 * when the story was saved and put the player's own URL in `embedUrl`. This
 * renders what came back, in order, with the two honest lines each item carries
 * - what it shows and whose it is - printed under it rather than hidden behind
 * a tap, because a photograph borrowed from somebody is not the reader's to
 * discover.
 */
export default function StoryGallery({ items, title }: Props) {
  const { t } = useI18n()
  const list = Array.isArray(items) ? items.filter((item) => item && (item.embedUrl || item.url)) : []
  if (!list.length) return null

  return (
    <div className="space-y-6">
      {list.map((item, index) => {
        const isVideo = item.kind === 'video'
        return (
          <figure key={item._id || `${item.kind}-${index}`}>
            {isVideo ? (
              <StoryVideo
                source={item.source}
                embedUrl={item.embedUrl}
                videoUrl={item.url}
                title={item.caption || title || ''}
              />
            ) : (
              <MediaImage
                src={item.url}
                alt={item.caption || title || ''}
                className="h-auto w-full rounded-xl border border-slate-200"
              />
            )}
            {(item.caption || item.credit) && (
              <figcaption className="mt-1.5 text-xs text-slate-500">
                {item.caption && <span>{item.caption}</span>}
                {item.caption && item.credit && <span className="mx-1.5" aria-hidden="true">·</span>}
                {item.credit && (
                  <>
                    {t('articles.imageCredit')}: {item.credit}
                  </>
                )}
              </figcaption>
            )}
          </figure>
        )
      })}
    </div>
  )
}
