import { useEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { useI18n } from '../../context/I18nContext'
import { cn } from '../../utils/cn'
import { SECTIONS, type SectionNode } from '../../data/sections'

const DESKTOP_DROPDOWNS_QUERY = '(min-width: 1024px)'
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/** How fast the phone strip drifts, how long it rests at each end, and how long
 * it stays still after a reader touches it. */
const MARQUEE_SPEED = 30
const MARQUEE_REST_AT_END_MS = 1400
const MARQUEE_RESUME_AFTER_TOUCH_MS = 6000

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const media = window.matchMedia(query)
    const onChange = () => setMatches(media.matches)
    onChange()
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [query])
  return matches
}

// The sections get a line of their own under the masthead, which is what gives
// ten names and their sub-section panels room to sit side by side. The row is
// still measured before a panel is allowed to open, because a hover menu cannot
// escape a scroller - below the width where everything fits, the strip scrolls
// and the arrows stay hidden rather than promising a panel that gets clipped.
function useAllowsDropdowns() {
  return useMediaQuery(DESKTOP_DROPDOWNS_QUERY)
}

/**
 * Whether the row has room for every name it is holding.
 *
 * This is what stops the overlap the reader used to see: a row that is told it
 * may not shrink, but is never measured, simply draws its links straight through
 * the radio, LIVE and language buttons beside it. Once it is known not to fit, the
 * row scrolls instead of spilling, and the sub-section arrows go away because a
 * panel cannot open inside a scroller.
 *
 * The width that matters is the one the names *want*, so the list is given
 * `w-max` in the markup and measured as a box: `scrollWidth` reports the size of
 * the box that holds it, which means a row that has already been told to scroll
 * reads as a perfect fit and never reads as anything else again.
 *
 * The answer is also chased for a frame and for the webfont, because both change
 * what the names cost after the row was first painted, and neither of them moves
 * the row itself - so a resize observer on the row alone is watching the wrong
 * element.
 */
function useFitsInRow(rowRef: RefObject<HTMLDivElement | null>, listRef: RefObject<HTMLUListElement | null>, layout: string) {
  const [fits, setFits] = useState(true)
  useEffect(() => {
    const row = rowRef.current
    const list = listRef.current
    if (!row || !list) return
    let alive = true
    let frame = 0
    const measure = () => {
      if (!alive) return
      setFits(list.getBoundingClientRect().width <= row.clientWidth + 1)
    }
    measure()
    const observer = new ResizeObserver(measure)
    // Both, because either side can be the one that changes: the header when the
    // window moves, the list when a section name is translated into something longer.
    observer.observe(row)
    observer.observe(list)
    const afterFonts = () => {
      if (document.fonts?.ready) void document.fonts.ready.then(measure)
    }
    afterFonts()
    frame = requestAnimationFrame(() => {
      measure()
      afterFonts()
    })
    return () => {
      alive = false
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [rowRef, listRef, layout])
  return fits
}

/**
 * The section strip on a phone, moving by itself.
 *
 * Nine section names do not fit across 360 pixels, and a reader who has to open
 * a menu to reach Sport is not being given navigation. So the strip drifts to one
 * end, rests, and comes back — every name stays a real link the whole time, which
 * is why it bounces instead of looping a duplicated copy of itself. It stops for
 * a finger, for a keyboard, and for a device that has asked for less motion.
 */
function useSelfScroll(enabled: boolean) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const steering = useRef({
    hovered: false,
    focused: false,
    holdUntil: 0,
    direction: 1,
    last: 0,
    resting: 0,
    // Where the strip thinks it is, kept as a fraction. scrollLeft is rounded and
    // clamped by the browser - on a 1.5x screen it stops a third of a pixel short
    // of scrollWidth - clientWidth - so judging the turn against the live value
    // either pins the strip to an end or resets it before it has started.
    position: 0,
    written: 0,
  })

  useEffect(() => {
    const element = scrollRef.current
    if (!element || !enabled) return
    const state = steering.current
    state.position = element.scrollLeft
    let frame = 0
    const step = (now: number) => {
      const delta = state.last ? Math.min(now - state.last, 64) : 0
      state.last = now
      const max = element.scrollWidth - element.clientWidth
      if (state.resting && now - state.resting > MARQUEE_REST_AT_END_MS) state.resting = 0
      if (max > 1 && !state.hovered && !state.focused && now >= state.holdUntil && !state.resting) {
        state.position += (MARQUEE_SPEED * delta * state.direction) / 1000
        if (state.position >= max) {
          state.position = max
          state.direction = -1
          state.resting = now
        } else if (state.position <= 0) {
          state.position = 0
          state.direction = 1
          state.resting = now
        }
        state.written = state.position
        element.scrollLeft = state.position
      }
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [enabled])

  const hold = () => {
    steering.current.holdUntil = performance.now() + MARQUEE_RESUME_AFTER_TOUCH_MS
  }

  const handlers = {
    onPointerEnter: () => { steering.current.hovered = true },
    onPointerLeave: () => { steering.current.hovered = false },
    onFocus: () => { steering.current.focused = true },
    onBlur: () => { steering.current.focused = false },
    onPointerDown: hold,
    onTouchStart: hold,
    // A swipe is the reader steering. If the value on screen is not the one this
    // hook wrote, someone moved it by hand, so pick that up instead of dragging
    // them back to where the ticker thinks they should be.
    onScroll: () => {
      const element = scrollRef.current
      if (!element) return
      const state = steering.current
      if (Math.abs(element.scrollLeft - state.written) > 2) state.position = element.scrollLeft
    },
  }

  return { scrollRef, handlers }
}

function sectionHref(section: SectionNode) {
  return `/${section.slug}`
}

function childHref(section: SectionNode, child: SectionNode) {
  return `/${section.slug}/${child.slug}`
}

interface SectionNavProps {
  /** Extra links that sit after the sections, e.g. News and Categories. */
  extraLinks?: { href: string; label: string }[]
  className?: string
  /** 'bar' is the masthead row, 'stack' the mobile menu, 'marquee' the phone strip. */
  layout?: 'bar' | 'stack' | 'marquee'
  /** Links that are not sections — the radio and LIVE buttons — kept at the end. */
  trailing?: ReactNode[]
  /** Lets the mobile menu close itself when a link inside it is used. */
  onNavigate?: () => void
}

export default function SectionNav({ extraLinks = [], className, layout = 'bar', trailing = [], onNavigate }: SectionNavProps) {
  const { t } = useI18n()
  const location = useLocation()
  const allowsDropdowns = useAllowsDropdowns()
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY)
  const [openSlug, setOpenSlug] = useState<string | null>(null)
  const [openAccordion, setOpenAccordion] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const fitsInRow = useFitsInRow(rowRef, listRef, layout)
  const canOpenPanels = allowsDropdowns && fitsInRow
  // The phone strip always drifts; the masthead row drifts only when it has run
  // out of room, which is the case it used to fail at by drawing through the
  // buttons beside it. A row with room for every name stays exactly where it is.
  const drifts = layout === 'marquee' || (layout === 'bar' && !fitsInRow)
  const marquee = useSelfScroll(drifts && !reducedMotion)

  // Whichever section the reader is looking at stays lit, including when they are
  // three levels deep on /world/africa.
  const activeSectionSlug = (() => {
    const first = location.pathname.split('/')[1]
    return first && SECTIONS.some((section) => section.slug === first) ? first : null
  })()

  useEffect(() => {
    if (layout === 'bar') setOpenSlug(null)
    else setOpenAccordion(null)
  }, [location.pathname, layout])

  useEffect(() => {
    if (layout !== 'bar' || !openSlug) return
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenSlug(null)
    }
    const onPointerdown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpenSlug(null)
    }
    document.addEventListener('keydown', onKeydown)
    document.addEventListener('pointerdown', onPointerdown)
    return () => {
      document.removeEventListener('keydown', onKeydown)
      document.removeEventListener('pointerdown', onPointerdown)
    }
  }, [layout, openSlug])

  if (layout === 'marquee') {
    const chip = ({ isActive }: { isActive: boolean }) =>
      cn(
        'whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] font-bold transition',
        isActive
          ? 'border-brand-600 bg-brand-600 text-white dark:border-blue-600 dark:bg-blue-600'
          : 'border-transparent text-gray-800 hover:border-gray-300 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800',
      )

    return (
      <div ref={rootRef} className={cn('relative h-full', className)}>
        {/* Both ends fade into the header so a name that is only partly on screen
            reads as "there is more", not as a broken layout. */}
        <span className="pointer-events-none absolute inset-y-0 left-0 z-10 w-5 bg-gradient-to-r from-white to-transparent dark:from-gray-900" aria-hidden="true" />
        <span className="pointer-events-none absolute inset-y-0 right-0 z-10 w-5 bg-gradient-to-l from-white to-transparent dark:from-gray-900" aria-hidden="true" />
        <div
          ref={marquee.scrollRef}
          {...marquee.handlers}
          className="h-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <ul role="list" aria-label={t('nav.sections')} className="flex h-full w-max items-center gap-1.5 px-2">
            {SECTIONS.map((section) => (
              <li key={section.slug} className="shrink-0">
                <NavLink to={sectionHref(section)} onClick={onNavigate} className={chip}>
                  {t(section.labelKey)}
                </NavLink>
              </li>
            ))}
            {extraLinks.map((link) => (
              <li key={link.href} className="shrink-0">
                <NavLink to={link.href} onClick={onNavigate} className={chip}>
                  {link.label}
                </NavLink>
              </li>
            ))}
            {trailing.map((node, index) => (
              <li key={`extra-${index}`} className="shrink-0">{node}</li>
            ))}
          </ul>
        </div>
      </div>
    )
  }

  if (layout === 'stack') {
    return (
      <div ref={rootRef} className={cn('grid gap-1', className)}>
        {SECTIONS.map((section) => {
          const expanded = openAccordion === section.slug
          return (
            <div key={section.slug}>
              <div className="flex items-center gap-1">
                <NavLink
                  to={sectionHref(section)}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'flex-1 rounded-lg px-3 py-2 text-sm font-bold transition',
                      isActive || activeSectionSlug === section.slug
                        ? 'bg-brand-600 text-white dark:bg-blue-600'
                        : 'text-gray-800 hover:text-brand-600 dark:text-gray-200 dark:hover:text-brand-400',
                    )
                  }
                >
                  {t(section.labelKey)}
                </NavLink>
                {section.children.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setOpenAccordion(expanded ? null : section.slug)}
                    aria-expanded={expanded}
                    aria-controls={`mobile-sub-${section.slug}`}
                    aria-label={`${t(section.labelKey)} — ${expanded ? 'hide' : 'show'} sub-sections`}
                    className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                  >
                    <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
                  </button>
                )}
              </div>
              {expanded && (
                <div id={`mobile-sub-${section.slug}`} className="mb-1 ml-3 grid gap-0.5 border-l border-gray-200 pl-3 dark:border-gray-700">
                  {section.children.map((child) => (
                    <NavLink
                      key={child.slug}
                      to={childHref(section, child)}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          'rounded-lg px-3 py-1.5 text-sm font-medium transition',
                          isActive
                            ? 'bg-brand-50 text-brand-700 dark:bg-blue-900/40 dark:text-blue-300'
                            : 'text-gray-700 hover:text-brand-600 dark:text-gray-300 dark:hover:text-brand-400',
                        )
                      }
                    >
                      {t(child.labelKey)}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {extraLinks.map((link) => (
          <NavLink
            key={link.href}
            to={link.href}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'rounded-lg px-3 py-2 text-sm font-bold transition',
                isActive
                  ? 'bg-brand-600 text-white dark:bg-blue-600'
                  : 'text-gray-800 hover:text-brand-600 dark:text-gray-200 dark:hover:text-brand-400',
              )
            }
          >
            {link.label}
          </NavLink>
        ))}
      </div>
    )
  }

  return (
    <div
      ref={(node) => {
        rootRef.current = node
        rowRef.current = node
        marquee.scrollRef.current = node
      }}
      {...marquee.handlers}
      className={cn(
        'min-w-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        // Room for every name: draw them all and let a sub-section panel escape
        // the row. No room: the row scrolls itself instead of spilling over the
        // buttons beside it, and the arrows go, because a panel cannot be seen
        // through a scroller.
        fitsInRow ? 'overflow-visible' : 'overflow-x-auto',
        className,
      )}
    >
      <ul ref={listRef} role="list" aria-label={t('nav.sections')} className="flex w-max min-w-full items-center">
        {SECTIONS.map((section) => {
          const isOpen = canOpenPanels && openSlug === section.slug
          const isActive = activeSectionSlug === section.slug
          // The right padding is the arrow's seat, and only the sections that have
          // an arrow pay for it. The arrow itself is taken out of the flow so that
          // whether it is showing or not the row costs the same width - otherwise
          // the measurement that decides if the names fit would change the room they
          // have to fit in, and the strip would pulse between the two answers.
          const pill = cn(
            'whitespace-nowrap rounded-lg py-1.5 pl-2 text-[13px] font-bold underline-offset-4 transition',
            section.children.length > 0 ? 'pr-5' : 'pr-2',
            isActive
              ? 'bg-brand-600 text-white shadow-sm dark:bg-blue-600'
              : 'text-gray-800 hover:text-brand-600 hover:underline dark:text-gray-200 dark:hover:text-brand-400',
          )
          return (
            <li
              key={section.slug}
              className="relative shrink-0"
              onPointerEnter={() => canOpenPanels && section.children.length > 0 && setOpenSlug(section.slug)}
              onPointerLeave={() => canOpenPanels && setOpenSlug(null)}
            >
              <div className="flex items-center">
                <NavLink
                  to={sectionHref(section)}
                  onFocus={() => canOpenPanels && section.children.length > 0 && setOpenSlug(section.slug)}
                  className={pill}
                >
                  {t(section.labelKey)}
                </NavLink>
                {section.children.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setOpenSlug(isOpen ? null : section.slug)}
                    aria-expanded={canOpenPanels && isOpen}
                    aria-haspopup="true"
                    aria-label={`${t(section.labelKey)} sub-sections`}
                    className={cn(
                      'absolute right-1 top-1/2 -translate-y-1/2 rounded p-px text-gray-500 hover:text-brand-600 dark:text-gray-400 dark:hover:text-brand-400',
                      // Out of the row's way when the row is a scroller: a panel
                      // opened inside one is clipped, and an arrow that goes nowhere
                      // is a lie.
                      !canOpenPanels && 'invisible',
                    )}
                  >
                    <ChevronDown className={cn('h-3 w-3 transition-transform', isOpen && 'rotate-180')} aria-hidden="true" />
                  </button>
                )}
              </div>
              {isOpen && (
                <div className="absolute left-0 top-full z-50 pt-1">
                  <div className="w-52 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                    <Link
                      to={sectionHref(section)}
                      className="block rounded-lg px-3 py-2 text-sm font-bold text-gray-800 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700"
                    >
                      {t('section.viewAll')}
                    </Link>
                    {section.children.map((child) => (
                      <NavLink
                        key={child.slug}
                        to={childHref(section, child)}
                        className={({ isActive: onChild }) =>
                          cn(
                            'block rounded-lg px-3 py-2 text-sm font-medium transition',
                            onChild
                              ? 'bg-brand-50 text-brand-700 dark:bg-blue-900/40 dark:text-blue-300'
                              : 'text-gray-700 hover:bg-gray-100 hover:text-brand-600 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-brand-400',
                          )
                        }
                      >
                        {t(child.labelKey)}
                      </NavLink>
                    ))}
                  </div>
                </div>
              )}
            </li>
          )
        })}
        {extraLinks.map((link) => (
          <li key={link.href} className="shrink-0">
            <NavLink
              to={link.href}
              className={({ isActive }) =>
                cn(
                  'block whitespace-nowrap rounded-lg px-2 py-1.5 text-[13px] font-bold underline-offset-4 transition',
                  isActive
                    ? 'bg-brand-600 text-white shadow-sm dark:bg-blue-600'
                    : 'text-gray-800 hover:text-brand-600 hover:underline dark:text-gray-200 dark:hover:text-brand-400',
                )
              }
            >
              {link.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  )
}
