import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { useI18n } from '../../context/I18nContext'
import { cn } from '../../utils/cn'
import { SECTIONS, type SectionNode } from '../../data/sections'

const DESKTOP_DROPDOWNS_QUERY = '(min-width: 1024px)'

// Below this the row is a scrollable strip, so a hover panel would be clipped by
// it. On lg and up the row has room and the panels are allowed to overflow.
function useAllowsDropdowns() {
  const [allowed, setAllowed] = useState(false)
  useEffect(() => {
    const query = window.matchMedia(DESKTOP_DROPDOWNS_QUERY)
    const onChange = () => setAllowed(query.matches)
    onChange()
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return allowed
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
  /** Rendered as a vertical accordion for the mobile menu. */
  layout?: 'bar' | 'stack'
  /** Lets the mobile menu close itself when a link inside it is used. */
  onNavigate?: () => void
}

export default function SectionNav({ extraLinks = [], className, layout = 'bar', onNavigate }: SectionNavProps) {
  const { t } = useI18n()
  const location = useLocation()
  const allowsDropdowns = useAllowsDropdowns()
  const [openSlug, setOpenSlug] = useState<string | null>(null)
  const [openAccordion, setOpenAccordion] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

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
      ref={rootRef}
      className={cn(
        'md:overflow-x-auto lg:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      <ul className="flex items-center gap-0.5">
        {SECTIONS.map((section) => {
          const isOpen = allowsDropdowns && openSlug === section.slug
          const isActive = activeSectionSlug === section.slug
          return (
            <li
              key={section.slug}
              className="relative shrink-0"
              onPointerEnter={() => allowsDropdowns && section.children.length > 0 && setOpenSlug(section.slug)}
              onPointerLeave={() => allowsDropdowns && setOpenSlug(null)}
            >
              <div className="flex items-center">
                <NavLink
                  to={sectionHref(section)}
                  onFocus={() => allowsDropdowns && section.children.length > 0 && setOpenSlug(section.slug)}
                  className={cn(
                    'whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13px] font-bold underline-offset-4 transition',
                    isActive
                      ? 'bg-brand-600 text-white shadow-sm dark:bg-blue-600'
                      : 'text-gray-800 hover:text-brand-600 hover:underline dark:text-gray-200 dark:hover:text-brand-400',
                  )}
                >
                  {t(section.labelKey)}
                </NavLink>
                {section.children.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setOpenSlug(isOpen ? null : section.slug)}
                    aria-expanded={isOpen}
                    aria-haspopup="true"
                    aria-label={`${t(section.labelKey)} sub-sections`}
                    className="-ml-1 rounded-lg p-1 text-gray-500 hover:text-brand-600 dark:text-gray-400 dark:hover:text-brand-400"
                  >
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-180')} aria-hidden="true" />
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
                  'block whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13px] font-bold underline-offset-4 transition',
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
