import { Link } from 'react-router-dom'
import { PhoneCall } from 'lucide-react'
import { useI18n } from '../../context/I18nContext'
import { contactEmail } from '../../utils/siteConfig'
import { cn } from '../../utils/cn'

/**
 * The space, offered by us.
 *
 * An ad slot that Google has not filled is not empty real estate on our site: it
 * is a reader looking at a hole. Until there is an advertiser to pay for it, the
 * slot is sold to the newsroom itself, with the offer written on it - which is
 * what every other Rwandan paper does with a space it has not let go, and what
 * the reader asked for here.
 *
 * It is labelled as advertising like any other unit, it never pretends to be a
 * story, and the motion is only decoration: `motion-safe:` means a device that
 * asked for less motion gets the same card standing still.
 */

export type Shape = 'banner' | 'rail' | 'rect'

interface AdvertiseWithUsProps {
  shape?: Shape
  className?: string
}

const SHELL: Record<Shape, string> = {
  // 728x90 and its responsive cousins: one line of offer, one button.
  banner: 'min-h-[92px] flex-row items-center justify-between gap-4 px-4 py-3 sm:min-h-[104px] sm:px-6',
  // 300x600 in the column beside a story or a list of them.
  rail: 'min-h-[420px] flex-col items-start justify-between gap-6 px-5 py-6 sm:min-h-[560px]',
  // 300x250, for anywhere a square-ish block is wanted.
  rect: 'min-h-[250px] flex-col items-start justify-between gap-4 px-5 py-5',
}

export default function AdvertiseWithUs({ shape = 'banner', className }: AdvertiseWithUsProps) {
  const { t } = useI18n()

  // There is no rate card to read on this site, so the way in is the same way
  // every other enquiry gets to the newsroom: the contact address the owner put
  // in the build environment, or the advertising page that explains how it works.
  const subject = encodeURIComponent('Advertising on RADAR')
  const ctaClass = cn(
    'relative inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-[#0a1f4d] shadow transition hover:bg-blue-50 motion-safe:animate-[ads-house-nudge_3.6s_ease-in-out_infinite]',
    shape === 'banner' && 'w-full sm:w-auto',
  )
  const ctaBody = (
    <>
      <PhoneCall className="h-4 w-4 shrink-0" aria-hidden="true" />
      {t('ads.houseCta')}
    </>
  )

  return (
    <aside
      aria-label={t('ads.label')}
      className={cn(
        'ads-house-pattern notranslate relative flex w-full overflow-hidden rounded-xl border border-[#12306b] text-white shadow-sm',
        SHELL[shape],
        className,
      )}
    >
      {/* A light sweeping across the cloth, the way a printed banner catches the
          sun. It is decoration, so it is hidden from readers who cannot see it. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 rotate-12 bg-gradient-to-r from-transparent via-white/20 to-transparent motion-safe:animate-[ads-house-shine_5.5s_ease-in-out_infinite]"
      />

      <div className="relative min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-200">{t('ads.label')}</p>
        <p
          className={cn(
            'mt-1 font-extrabold uppercase leading-[1.05] tracking-tight motion-safe:animate-[ads-house-slide_7s_ease-in-out_infinite]',
            shape === 'banner' ? 'text-xl sm:text-2xl lg:text-[28px]' : 'text-2xl sm:text-3xl',
          )}
        >
          {t('ads.houseHeadline')}
        </p>
        <p className={cn('mt-1.5 text-xs leading-snug text-blue-100', shape === 'banner' && 'hidden sm:block')}>
          {t('ads.houseNote')}
        </p>
      </div>

      {contactEmail ? (
        <a href={`mailto:${contactEmail}?subject=${subject}`} className={ctaClass}>
          {ctaBody}
        </a>
      ) : (
        <Link to="/advertising" className={ctaClass}>
          {ctaBody}
        </Link>
      )}
    </aside>
  )
}
