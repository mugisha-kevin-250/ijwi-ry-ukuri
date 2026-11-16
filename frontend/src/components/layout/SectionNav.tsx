import { useEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { useI18n } from '../../context/I18nContext'
import { cn } from '../../utils/cn'
import { type SectionFeature, type SectionNode, featuresFor } from '../../data/sections'
import { sectionLabel, useSections } from '../../utils/sectionsStore'

// The section line is drawn from `md` up, so that is the width where its
// dropdowns belong. It used to be 1024px, which left every laptop between those
// two numbers with a bar of section names that had no arrows and no panels: the
// sub-sections were still there, but nothing on screen admitted they existed.
const DESKTOP_DROPDOWNS_QUERY = '(min-width: 768px)'
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * The six names the desktop bar keeps.
 *
 * Six is the whole argument: the row is measured before any sub-section panel is
 * allowed to open, and a row holding nine names plus a duplicate "News" link does
 * not fit at a tablet's width, so the panels switched themselves off and Middle
 * East, Africa and the rest became unreachable without anybody saying so. Six
 * beats leave the row about 450px of the 736px it has, which is room to spare
 * even when the chrome is read in a longer language, so every name in the bar
 * keeps its arrow again.
 *
 * Which six is the owner's call, and it has been made twice. Trending is one of
 * them now — it is the first thing a reader arrives looking for, and it is a
 * section the newsroom files stories in like any other — and Rwanda has taken its
 * seat in the More panel, where it sits at the top of the list. Nothing is lost
 * either way: whatever leaves the bar keeps its sub-sections and is listed in the
 * More panel beside it, and the phone strip and the menu still show everything.
 */
const BAR_SECTIONS = ['trending', 'world', 'politics', 'business', 'tech', 'sports']

/** The open-panel key for the More pill, which is not a section. */
const MORE_KEY = '__more__'

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

/**
 * The extra link inside a section's panel that is not a shelf of the archive.
 *
 * Live Sports is the only one today, and it earns its place by being the thing a
 * reader under Sports actually wants right now. It is printed first and marked,
 * because a scores desk buried at the bottom of a list of five topic pages is a
 * desk nobody finds.
 */
function FeatureLink({ feature, className, onNavigate }: { feature: SectionFeature; className: string; onNavigate?: () => void }) {
  const { t } = useI18n()
  return (
    <NavLink to={feature.href} onClick={onNavigate} className={className}>
      <span className="flex items-center gap-2">
        {feature.live && (
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500 opacity-75 motion-reduce:hidden" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-600" />
          </span>
        )}
        {t(feature.labelKey)}
      </span>
    </NavLink>
  )
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
  // The shipped table paints the strip; what the newsroom added since then is
  // folded in as soon as the server answers, so a section the admin created
  // today is navigation tomorrow morning without another build.
  const { sections } = useSections()
  const allowsDropdowns = useAllowsDropdowns()
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY)
  const [openSlug, setOpenSlug] = useState<string | null>(null)
  const [openAccordion, setOpenAccordion] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const fitsInRow = useFitsInRow(rowRef, listRef, layout)
  const canOpenPanels = allowsDropdowns && fitsInRow
  // Only the phone strip drifts. The desktop bar is navigation, not a ticker: a
  // reader cannot catch a link that is moving under the cursor, and a name that
  // slides past is a name they have to wait for. When the desktop names do not
  // fit, the row scrolls for the reader's own hand and the arrows hide, which is
  // the case the shortened bar plus the More panel exists to avoid.
  const drifts = layout === 'marquee'
  const marquee = useSelfScroll(drifts && !reducedMotion)

  // The bar shows six beats and hands the rest to the More panel; the phone
  // strip and the menu keep showing everything, because there the row scrolls
  // anyway and a panel has no room to open in.
  const isBarSection = (section: SectionNode) => BAR_SECTIONS.includes(section.slug)
  const barSections = layout === 'bar' ? sections.filter(isBarSection) : sections
  const moreSections = sections.filter((section) => !isBarSection(section))

  // Whichever section the reader is looking at stays lit, including when they are
  // three levels deep on /world/africa.
  const activeSectionSlug = (() => {
    const first = location.pathname.split('/')[1]
    return first && sections.some((section) => section.slug === first) ? first : null
  })()

  // The More pill is lit for whatever it is holding, so a reader on /rwanda or
  // /articles still sees where they are, the same as on a name in the bar.
  const moreActive = moreSections.some((section) => activeSectionSlug === section.slug)
    || extraLinks.some((link) => location.pathname === link.href)
  // It pays for an arrow seat whether or not the arrow is showing, for the same
  // reason the sections do: the width of the row is what decides if the panels
  // are allowed, so the row may not change width because of that decision.
  const morePill = cn(
    'whitespace-nowrap rounded-lg py-1.5 pl-1.5 pr-[17px] text-left text-[13px] font-bold underline-offset-4 transition',
    moreActive
      ? 'bg-brand-600 text-white shadow-sm dark:bg-blue-600'
      : 'text-gray-800 hover:text-brand-600 hover:underline dark:text-gray-200 dark:hover:text-brand-400',
  )
  const hasMore = moreSections.length > 0 || extraLinks.length > 0

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
            {sections.map((section) => (
              <li key={section.slug} className="flex shrink-0 items-center gap-1.5">
                <NavLink to={sectionHref(section)} onClick={onNavigate} className={chip}>
                  {sectionLabel(section, t)}
                </NavLink>
                {/* On a phone there is no hover panel to put the scores desk in,
                    so it rides next to the section it belongs to — the strip
                    scrolls, and "under Sports" means beside it here. */}
                {featuresFor(section.slug).map((feature) => (
                  <FeatureLink key={feature.href} feature={feature} className={chip({ isActive: false })} />
                ))}
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
        {sections.map((section) => {
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
                  {sectionLabel(section, t)}
                </NavLink>
                {section.children.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setOpenAccordion(expanded ? null : section.slug)}
                    aria-expanded={expanded}
                    aria-controls={`mobile-sub-${section.slug}`}
                    aria-label={`${sectionLabel(section, t)} — ${expanded ? 'hide' : 'show'} sub-sections`}
                    className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                  >
                    <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
                  </button>
                )}
              </div>
              {expanded && (
                <div id={`mobile-sub-${section.slug}`} className="mb-1 ml-3 grid gap-0.5 border-l border-gray-200 pl-3 dark:border-gray-700">
                  {featuresFor(section.slug).map((feature) => (
                    <FeatureLink
                      key={feature.href}
                      feature={feature}
                      className={cn(
                        'rounded-lg px-3 py-1.5 text-sm font-bold transition',
                        'bg-brand-50 text-brand-700 dark:bg-blue-900/40 dark:text-blue-300',
                      )}
                    />
                  ))}
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
                      {sectionLabel(child, t)}
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
      }}
      className={cn(
        'min-w-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        // Room for the names that are drawn: they sit still and a sub-section
        // panel is allowed to escape the row. No room: the row scrolls for the
        // reader's own hand instead of spilling over the buttons beside it, and
        // the arrows go, because a panel cannot be seen through a scroller.
        fitsInRow ? 'overflow-visible' : 'overflow-x-auto',
        className,
      )}
    >
      <ul ref={listRef} role="list" aria-label={t('nav.sections')} className="flex w-max min-w-full items-center">
        {barSections.map((section) => {
          const isOpen = canOpenPanels && openSlug === section.slug
          const isActive = activeSectionSlug === section.slug
          // The right padding is the arrow's seat, and only the sections that have
          // an arrow pay for it. The arrow itself is taken out of the flow so that
          // whether it is showing or not the row costs the same width - otherwise
          // the measurement that decides if the names fit would change the room they
          // have to fit in, and the strip would pulse between the two answers.
          // The seats are deliberately tight: the six beats and the More pill
          // cost about 450px at a tablet's width, where the row has 736px, and
          // that margin is what a section name has left to grow into when the
          // reader is reading the chrome in another language.
          const pill = cn(
            'whitespace-nowrap rounded-lg py-1.5 pl-1.5 text-[13px] font-bold underline-offset-4 transition',
            section.children.length > 0 ? 'pr-[17px]' : 'pr-1.5',
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
                  {sectionLabel(section, t)}
                </NavLink>
                {section.children.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setOpenSlug(isOpen ? null : section.slug)}
                    aria-expanded={canOpenPanels && isOpen}
                    aria-haspopup="true"
                    aria-label={`${sectionLabel(section, t)} sub-sections`}
                    className={cn(
                      'absolute right-0.5 top-1/2 -translate-y-1/2 rounded p-px text-gray-500 hover:text-brand-600 dark:text-gray-400 dark:hover:text-brand-400',
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
                    {featuresFor(section.slug).map((feature) => (
                      <FeatureLink
                        key={feature.href}
                        feature={feature}
                        className="mb-0.5 block rounded-lg bg-brand-50 px-3 py-2 text-sm font-bold text-brand-700 transition hover:bg-brand-100 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60"
                      />
                    ))}
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
                        {sectionLabel(child, t)}
                      </NavLink>
                    ))}
                  </div>
                </div>
              )}
            </li>
          )
        })}
        {hasMore && (
          <li
            className="relative shrink-0"
            onPointerEnter={() => canOpenPanels && setOpenSlug(MORE_KEY)}
            onPointerLeave={() => canOpenPanels && setOpenSlug(null)}
          >
            <div className="flex items-center">
              {/* Where the row has room for a panel, More opens one. Where it does
                  not, the panel would be clipped by the scroller, so the same word
                  is a link to the full index instead: it always goes somewhere
                  real, and it costs the same width either way. */}
              {canOpenPanels ? (
                <button
                  type="button"
                  onClick={() => setOpenSlug(openSlug === MORE_KEY ? null : MORE_KEY)}
                  aria-expanded={openSlug === MORE_KEY}
                  aria-haspopup="true"
                  aria-label={t('section.more')}
                  className={morePill}
                >
                  {t('nav.more')}
                </button>
              ) : (
                <NavLink to="/categories" className={morePill} aria-label={t('section.more')}>
                  {t('nav.more')}
                </NavLink>
              )}
              <span
                aria-hidden="true"
                className={cn(
                  'pointer-events-none absolute right-0.5 top-1/2 -translate-y-1/2 p-px text-gray-500 dark:text-gray-400',
                  !canOpenPanels && 'invisible',
                )}
              >
                <ChevronDown className={cn('h-3 w-3 transition-transform', openSlug === MORE_KEY && 'rotate-180')} />
              </span>
            </div>
            {canOpenPanels && openSlug === MORE_KEY && (
              <div className="absolute right-0 top-full z-50 pt-1">
                <div className="max-h-[70vh] w-64 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                  {moreSections.map((section) => (
                    <div key={section.slug} className="mb-1 last:mb-0">
                      <NavLink
                        to={sectionHref(section)}
                        onClick={() => setOpenSlug(null)}
                        className={({ isActive: onRow }) =>
                          cn(
                            'block rounded-lg px-3 py-2 text-sm font-bold transition',
                            onRow || activeSectionSlug === section.slug
                              ? 'bg-brand-50 text-brand-700 dark:bg-blue-900/40 dark:text-blue-300'
                              : 'text-gray-800 hover:bg-gray-100 hover:text-brand-600 dark:text-gray-100 dark:hover:bg-gray-700 dark:hover:text-brand-400',
                          )
                        }
                      >
                        {sectionLabel(section, t)}
                      </NavLink>
                      {/* The six that left the bar do not lose their shelves: a
                          section in this panel carries its sub-sections with it,
                          so the panel that came back with the shortened row is
                          not the only way in. */}
                      {section.children.length > 0 && (
                        <div className="ml-3 border-l border-gray-200 pl-2 dark:border-gray-700">
                          {section.children.map((child) => (
                            <NavLink
                              key={child.slug}
                              to={childHref(section, child)}
                              onClick={() => setOpenSlug(null)}
                              className={({ isActive: onChild }) =>
                                cn(
                                  'block rounded-lg px-3 py-1.5 text-sm font-medium transition',
                                  onChild
                                    ? 'bg-brand-50 text-brand-700 dark:bg-blue-900/40 dark:text-blue-300'
                                    : 'text-gray-600 hover:bg-gray-100 hover:text-brand-600 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-brand-400',
                                )
                              }
                            >
                              {sectionLabel(child, t)}
                            </NavLink>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {extraLinks.map((link) => (
                    <NavLink
                      key={link.href}
                      to={link.href}
                      onClick={() => setOpenSlug(null)}
                      className={({ isActive: onRow }) =>
                        cn(
                          'mt-1 block rounded-lg px-3 py-2 text-sm font-bold transition',
                          onRow
                            ? 'bg-brand-50 text-brand-700 dark:bg-blue-900/40 dark:text-blue-300'
                            : 'text-gray-800 hover:bg-gray-100 hover:text-brand-600 dark:text-gray-100 dark:hover:bg-gray-700 dark:hover:text-brand-400',
                        )
                      }
                    >
                      {link.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            )}
          </li>
        )}
      </ul>
    </div>
  )
}
