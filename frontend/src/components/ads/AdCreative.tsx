import { useI18n } from '../../context/I18nContext'
import { resolveMediaUrl } from '../../services/apiClient'
import { reportAdClick, type AdCampaign } from '../../utils/adsStore'
import { cn } from '../../utils/cn'
import type { Shape } from './AdvertiseWithUs'

/**
 * An advertisement somebody paid for.
 *
 * This is the creative the advertising desk sold: a named business, what it is
 * offering, and the link a reader goes to. It is printed inside the same reserved
 * space as the Google unit and the house offer, so the page does not jump when a
 * campaign takes over a slot, and it is labelled as advertising in the same words
 * every other unit on the site uses - a reader should never have to work out
 * whether they are reading news or being sold something.
 *
 * The colours come from the campaign, because an advertiser buying a space on a
 * news site expects it to look like their business. What does not come from them
 * is the structure: the layout here is ours, so a creative can be unreadable or
 * ugly but it can never be a page of markup we did not write.
 */

const SHELL: Record<Shape, string> = {
  strip: 'min-h-[52px] flex-row items-center gap-3 px-3 py-2 sm:min-h-[62px] sm:gap-4 sm:px-5',
  banner: 'min-h-[92px] flex-row items-center gap-4 px-4 py-3 sm:min-h-[104px] sm:px-6',
  rail: 'min-h-[420px] flex-col items-stretch gap-4 px-5 py-5 sm:min-h-[560px]',
  rect: 'min-h-[250px] flex-col items-stretch gap-4 px-5 py-5',
}

const HEADLINE: Record<Shape, string> = {
  strip: 'text-[15px] sm:text-lg',
  banner: 'text-lg sm:text-2xl lg:text-[26px]',
  rail: 'text-xl sm:text-2xl',
  rect: 'text-xl',
}

/** Whether to write the text light-on-dark or dark-on-light, when the campaign
 *  only told us the background. */
function readableOn(hex: string): string {
  const value = hex.replace('#', '')
  if (value.length !== 6) return '#ffffff'
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16) / 255)
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.62 ? '#0f172a' : '#ffffff'
}

interface AdCreativeProps {
  campaign: AdCampaign
  shape?: Shape
  className?: string
}

export default function AdCreative({ campaign, shape = 'banner', className }: AdCreativeProps) {
  const { t } = useI18n()

  const background = campaign.theme.bg || '#0a1f4d'
  const foreground = campaign.theme.fg || readableOn(background)
  const accent = campaign.theme.accent || foreground
  const image = resolveMediaUrl(campaign.image)
  const isWide = shape === 'banner' || shape === 'strip'

  return (
    <aside aria-label={t('ads.label')} className="notranslate">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('ads.label')}</p>
      <a
        href={campaign.link}
        target="_blank"
        rel="sponsored nofollow noopener noreferrer"
        onClick={() => reportAdClick(campaign.id)}
        className={cn(
          'relative flex w-full overflow-hidden rounded-xl border text-left shadow-sm transition hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2',
          SHELL[shape],
          className,
        )}
        style={{
          backgroundColor: background,
          borderColor: accent,
          color: foreground,
          outlineColor: accent,
        }}
      >
        {image ? (
          <img
            src={image}
            alt=""
            loading="lazy"
            className={cn(
              'shrink-0 rounded-lg object-cover',
              shape === 'strip' && 'h-9 w-9 sm:h-11 sm:w-11',
              shape === 'banner' && 'h-14 w-14 sm:h-[68px] sm:w-[68px]',
              !isWide && 'h-28 w-full sm:h-36',
            )}
          />
        ) : null}

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: accent }}>
            {campaign.advertiser}
          </span>
          <span
            className={cn(
              'mt-0.5 block font-extrabold leading-[1.15] tracking-tight',
              HEADLINE[shape],
              // Two lines at most, and never a mid-word ellipsis: on a phone the
              // button beside the headline takes a third of the width, and a
              // sold space that reads as cut off looks like a fault rather than
              // as an advert.
              shape === 'strip' && 'line-clamp-2',
            )}
          >
            {campaign.headline}
          </span>
          {/* The detail a reader only gets where there is room for it: never in
              the strip above the navigation, and on a wide banner only from
              tablet width up, where the line does not push the button away. */}
          {campaign.body && !isWide ? (
            <span className="mt-1.5 block text-[13px] leading-snug opacity-85">{campaign.body}</span>
          ) : null}
          {campaign.body && shape === 'banner' ? (
            <span className="mt-1.5 hidden text-[13px] leading-snug opacity-85 sm:block">{campaign.body}</span>
          ) : null}
        </span>

        {campaign.ctaLabel ? (
          <span
            className={cn(
              'inline-flex shrink-0 items-center rounded-full px-3.5 py-2 text-[11px] font-bold uppercase tracking-wide',
              shape === 'strip' && 'px-3 py-1.5 text-[10px]',
              shape === 'banner' && 'w-full sm:w-auto sm:px-4 sm:py-2.5 sm:text-xs',
              !isWide && 'mt-auto self-start',
            )}
            style={{ backgroundColor: accent, color: readableOn(accent) }}
          >
            {campaign.ctaLabel}
          </span>
        ) : null}
      </a>
    </aside>
  )
}
