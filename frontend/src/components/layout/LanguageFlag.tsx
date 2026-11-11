import type { Lang } from '../../context/I18nContext'
import { cn } from '../../utils/cn'

// Hand-drawn flags so the switcher needs no network requests and stays sharp at
// the small sizes the header uses.
export default function LanguageFlag({ lang, className }: { lang: Lang; className?: string }) {
  const box = cn('h-3.5 w-5 shrink-0 rounded-[2px] ring-1 ring-black/10', className)

  if (lang === 'en') {
    return (
      <svg viewBox="0 0 60 30" className={box} aria-hidden="true" focusable="false">
        <rect width="60" height="30" fill="#012169" />
        <path d="M0 0 60 30 M60 0 0 30" stroke="#fff" strokeWidth="6" />
        <path d="M0 0 60 30 M60 0 0 30" stroke="#C8102E" strokeWidth="2.4" />
        <path d="M30 0V30M0 15h60" stroke="#fff" strokeWidth="10" />
        <path d="M30 0V30M0 15h60" stroke="#C8102E" strokeWidth="6" />
      </svg>
    )
  }

  if (lang === 'rw') {
    const rays = Array.from({ length: 12 }, (_, index) => {
      const angle = (index * Math.PI) / 6
      return {
        x1: 15 + Math.cos(angle) * 5.4,
        y1: 10 + Math.sin(angle) * 5.4,
        x2: 15 + Math.cos(angle) * 8.4,
        y2: 10 + Math.sin(angle) * 8.4,
      }
    })
    return (
      <svg viewBox="0 0 60 40" className={box} aria-hidden="true" focusable="false">
        <rect width="60" height="20" fill="#00A1DE" />
        <rect y="20" width="60" height="10" fill="#FCD116" />
        <rect y="30" width="60" height="10" fill="#1EB53A" />
        <g stroke="#FCD116" strokeWidth="1.4" strokeLinecap="round">
          {rays.map((ray) => (
            <line key={`${ray.x1}-${ray.y1}`} x1={ray.x1} y1={ray.y1} x2={ray.x2} y2={ray.y2} />
          ))}
        </g>
        <circle cx="15" cy="10" r="4" fill="#FCD116" />
      </svg>
    )
  }

  if (lang === 'fr') {
    return (
      <svg viewBox="0 0 60 40" className={box} aria-hidden="true" focusable="false">
        <rect width="60" height="40" fill="#fff" />
        <rect width="20" height="40" fill="#002395" />
        <rect x="40" width="20" height="40" fill="#ED2939" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 60 40" className={box} aria-hidden="true" focusable="false">
      <polygon points="0,0 60,0 0,40" fill="#1EB53A" />
      <polygon points="60,0 60,40 0,40" fill="#00A3DD" />
      <path d="M0 40 60 0" stroke="#FCD116" strokeWidth="14" />
      <path d="M0 40 60 0" stroke="#000" strokeWidth="8" />
    </svg>
  )
}
