import { useEffect, useId, useState } from 'react'

interface RadarLogoProps {
  /** Square edge of the mark in pixels. */
  size?: number
  /** Show the RADAR wordmark beside the mark. */
  wordmark?: boolean
  /** Narrow headers run out of room before the mark does. */
  hideWordmarkOnSmallScreens?: boolean
  /** The footer is navy, so the mark has to be light there. */
  onDark?: boolean
  /**
   * Letters in pixels, when they must not follow the size of the mark. The
   * masthead leaves this out and grows with the circle; the footer pins it so
   * a smaller mark does not quietly shrink the name.
   */
  wordmarkFontSize?: number
  className?: string
}

const SWEEP_SECONDS = 4

// The sweep is drawn in SVG, so it stays sharp at any size and needs no image
// request. A reader who asked for less motion gets the same mark standing still.
export default function RadarLogo({
  size = 32,
  wordmark = false,
  hideWordmarkOnSmallScreens = false,
  onDark = false,
  wordmarkFontSize,
  className = '',
}: RadarLogoProps) {
  const [still, setStill] = useState(false)

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return
    const sync = () => setStill(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  const centre = size / 2
  const radius = centre - size * 0.0625
  const line = onDark ? '#e0f2fe' : '#1877F2'
  const core = onDark ? '#e0f2fe' : '#062b52'
  // The header mark and the footer mark share a page, so a fixed gradient id
  // would make one of them borrow the other's colours.
  const sweepId = `radar-sweep-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

  return (
    <span className={`inline-flex shrink-0 items-center gap-2 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="RADAR"
        focusable="false"
      >
        <defs>
          <linearGradient id={sweepId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={line} stopOpacity="0.55" />
            <stop offset="100%" stopColor={line} stopOpacity="0" />
          </linearGradient>
        </defs>

        <circle cx={centre} cy={centre} r={radius} fill={line} fillOpacity="0.08" />
        <g fill="none" stroke={line} strokeOpacity="0.35" strokeWidth={size * 0.03125}>
          <circle cx={centre} cy={centre} r={radius} />
          <circle cx={centre} cy={centre} r={radius * 0.55} />
        </g>

        {!still && (
          <g>
            <path
              d={`M${centre} ${centre} L${centre} ${centre - radius} A${radius} ${radius} 0 0 1 ${centre + radius * 0.7} ${centre - radius * 0.7} Z`}
              fill={`url(#${sweepId})`}
            >
              <animateTransform
                attributeName="transform"
                type="rotate"
                from={`0 ${centre} ${centre}`}
                to={`360 ${centre} ${centre}`}
                dur={`${SWEEP_SECONDS}s`}
                repeatCount="indefinite"
              />
            </path>
            <line
              x1={centre}
              y1={centre}
              x2={centre}
              y2={centre - radius}
              stroke={line}
              strokeWidth={size * 0.045}
              strokeLinecap="round"
            >
              <animateTransform
                attributeName="transform"
                type="rotate"
                from={`0 ${centre} ${centre}`}
                to={`360 ${centre} ${centre}`}
                dur={`${SWEEP_SECONDS}s`}
                repeatCount="indefinite"
              />
            </line>
          </g>
        )}

        {[
          { x: centre + radius * 0.42, y: centre - radius * 0.5, delay: 1.1 },
          { x: centre - radius * 0.55, y: centre + radius * 0.35, delay: 2.6 },
        ].map((blip) => (
          <circle key={`${blip.x}-${blip.y}`} cx={blip.x} cy={blip.y} r={size * 0.055} fill={onDark ? '#7dd3fc' : '#0ea5e9'} opacity={still ? 1 : 0}>
            {!still && (
              <animate
                attributeName="opacity"
                values="0;0;1;0.2;0"
                keyTimes="0;0.55;0.7;0.85;1"
                dur={`${SWEEP_SECONDS}s`}
                begin={`${blip.delay}s`}
                repeatCount="indefinite"
              />
            )}
          </circle>
        ))}

        <circle cx={centre} cy={centre} r={size * 0.05} fill={core} />
      </svg>

      {wordmark && (
        <span
          // The word used to be a fixed text-xl whatever the mark was, so the
          // only way to make the name on the masthead bigger was to enlarge the
          // circle and leave the letters behind. It now follows the mark -
          // roughly three fifths of its edge, which is what text-xl happened to
          // measure at 34px, so a header drawn before this change reads the same
          // until someone asks for a larger one. A caller that needs a fixed
          // size passes wordmarkFontSize: that is the footer, whose mark is
          // smaller than the masthead's and whose letters were never meant to
          // shrink with it.
          className={`font-black uppercase tracking-[0.18em] ${
            onDark ? 'text-white' : 'text-[#062b52] dark:text-blue-200'
          } ${hideWordmarkOnSmallScreens ? 'hidden sm:inline' : ''}`}
          style={{ fontSize: `${wordmarkFontSize ?? Math.round(size * 0.6)}px` }}
        >
          RADAR
        </span>
      )}
    </span>
  )
}
