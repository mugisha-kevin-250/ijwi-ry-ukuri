import React, { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Menu, X, User, Bookmark, LogOut, LayoutDashboard, Settings, Search } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { can, deskHomeFor, isStaff, roleLabel } from '../../utils/deskAccess'
import { useI18n } from '../../context/I18nContext'
import Avatar from '../common/Avatar'
import RadarLogo from '../common/RadarLogo'
import AdSlot from '../ads/AdSlot'
import LanguageSelector from './LanguageSelector'
import LiveButton from './LiveButton'
import RadioNewsButton from './RadioNewsButton'
import NotificationsBell from './NotificationsBell'
import SectionNav from './SectionNav'

interface HeaderProps {
  variant?: 'public' | 'writer' | 'editor' | 'admin'
  sidebarCollapsed?: boolean
}

/** How far a reader has to be into the page before the bought space is drawn. */
const AD_REVEAL_AFTER_PX = 160

/**
 * The masthead, and the height the rest of the page has to clear.
 *
 * The header is fixed, so every page under it needs to know how tall it is. That
 * used to be two numbers written into two files, which is fine until an advert
 * adds fifty pixels to the header and the top row of the page hides underneath it.
 * So the navigation - the masthead, the bought space and the section links - is
 * measured in the browser and published as `--header-h` for anything that needs
 * it. The collapsible menu deliberately sits outside what is measured: opening it
 * would otherwise shove the whole page down.
 */
export default function Header({ variant = 'public', sidebarCollapsed = false }: HeaderProps) {
  const { user, logout, token } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [isAdRevealed, setIsAdRevealed] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const barRef = useRef<HTMLElement | null>(null)

  // The section nav is the site's navigation. These sat beside the old category
  // strip, which is gone, so only the full index stays and it reads as"All news".
  const navLinks = [{ href: '/articles', label: t('nav.articles') }]

  const writerNavLinks = [
    { href: '/writer/dashboard', label: t('nav.writer.dashboard') },
    { href: '/writer/articles', label: t('nav.writer.myArticles') },
    { href: '/writer/profile', label: t('nav.writer.profile') },
  ]

  const editorNavLinks = [
    { href: '/editor/dashboard', label: t('nav.editor.dashboard') },
    { href: '/editor/pending', label: t('nav.editor.pending') },
    { href: '/editor/comments', label: t('nav.editor.comments') },
  ]

  const adminNavLinks = [
    { href: '/mugishaimekevin/dashboard', label: t('nav.admin.dashboard') },
    { href: '/mugishaimekevin/users', label: t('nav.admin.users') },
    { href: '/mugishaimekevin/articles', label: t('nav.admin.news') },
    // One moderation desk, reachable by both staff roles; the API checks the
    // role again no matter which header link was clicked.
    { href: '/editor/comments', label: t('nav.editor.comments') },
    { href: '/mugishaimekevin/ai-writer', label: t('nav.admin.aiWriter') },
    { href: '/mugishaimekevin/payouts', label: t('nav.admin.payouts') },
    { href: '/mugishaimekevin/messages', label: t('nav.admin.messages') },
    { href: '/mugishaimekevin/mail', label: t('nav.admin.mail') },
    // The clock's own desk: what ran on its own, and the way to finish a job a
    // failed minute left half-done.
    { href: '/mugishaimekevin/scheduler', label: t('nav.admin.scheduler') },
    // The section desk, not the reader's category index: an admin clicking here
    // is here to change the sections, not to browse them.
    { href: '/mugishaimekevin/categories', label: t('nav.admin.categories') },
    { href: '/mugishaimekevin/advertising', label: t('nav.admin.advertising') },
    { href: '/mugishaimekevin/settings', label: t('nav.admin.settings') },
  ]

  const getCurrentNavLinks = () => {
    switch (variant) {
      case 'writer':
        return writerNavLinks
      case 'editor':
        return editorNavLinks
      case 'admin':
        return adminNavLinks
      default:
        return navLinks
    }
  }

  const currentNavLinks = getCurrentNavLinks()
  // Two of the links below depend on what this account is allowed to open, and
  // the answer comes from the permission list the server sent with it - not from
  // its job title. The bar offers the "become a writer" invitation only to a
  // reader, because a member of staff whose job does not include writing would
  // be invited to apply for a desk they already sit in, and the dashboard link
  // lands each account on the desk that is actually its own.
  const canWrite = can(user, 'writeStories')

  const navLinkItems = currentNavLinks.map((link) => (
    <NavLink
      key={link.href}
      to={link.href}
      className={({ isActive }) =>
        // 15px matches the section line underneath, so"News" and the beats do
        // not read as two different sizes of the same thing.
        `shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-[15px] font-bold underline-offset-4 transition ${
          isActive
            ? 'bg-brand-600 text-white shadow-sm decoration-2 hover:underline dark:bg-blue-600'
            : 'text-gray-800 decoration-2 hover:text-brand-600 hover:underline dark:text-gray-200 dark:hover:text-brand-400'
        }`
      }
    >
      {link.label}
    </NavLink>
  ))

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const query = searchValue.trim()
    // The results page reads ?q=, so a search that arrives here has to use the
    // same name or the page opens with an empty box and no results.
    if (query) navigate(`/search?q=${encodeURIComponent(query)}`)
  }

  useEffect(() => {
    const onScroll = () => {
      setIsScrolled(window.scrollY > 8)
      // The bought space is not on the page until the reader has started reading
      // it. Crossing this line once is enough to bring it in, and it goes away
      // again when they come back to the top, so the first screen of the site is
      // always the news rather than the advertising.
      setIsAdRevealed(variant === 'public' && window.scrollY > AD_REVEAL_AFTER_PX)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [variant])

  // Publish the height the fixed rows take up, so the page under the header can
  // start below it without anyone keeping a magic number in two places. It runs on
  // mount and whenever the bar changes - a campaign arriving in the advert strip,
  // the reader rotating a phone, or the language making a section name longer.
  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const publish = () => {
      document.documentElement.style.setProperty('--header-h', `${Math.round(bar.getBoundingClientRect().height)}px`)
    }
    publish()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', publish)
      return () => window.removeEventListener('resize', publish)
    }
    const observer = new ResizeObserver(publish)
    observer.observe(bar)
    return () => observer.disconnect()
  }, [variant])

  return (
    <header
      translate="no"
      className={`fixed top-0 right-0 z-50 border-b bg-white transition-shadow dark:bg-gray-900 ${
        isScrolled ? 'border-gray-200 shadow-md dark:border-gray-700' : 'border-gray-200 dark:border-gray-700'
      } ${variant === 'public' ? 'left-0' : sidebarCollapsed ? 'left-16' : 'left-16 md:left-64'}`}
    >
      <nav ref={barRef} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8" aria-label="Main navigation">
        {/*
          The space a business buys is the first row of the site, above the name,
          on every public page. It is not there when the page first opens - the
          reader gets the newsroom, not an advert - and it slides in as soon as
          they start down the page, so it is the thing they see whenever they come
          back up. It is a strip rather than a banner because the header is fixed:
          anything taller steals a quarter of a phone screen. A campaign booked
          into"nav" prints here; when nobody has bought it the newsroom's own
          offer does, in the same height, so nothing below it moves.
        */}
        {variant === 'public' && (
          <div
            className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
              isAdRevealed ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
            }`}
            aria-hidden={!isAdRevealed}
            inert={!isAdRevealed}
          >
            <div className="min-h-0 overflow-hidden">
              <AdSlot name="nav" className="pb-1.5" />
            </div>
          </div>
        )}

        {/*
          The name is the first thing the reader sees, and the sections get a line
          of their own underneath it. They used to share the masthead row, which
          left them too narrow to hold ten names and their sub-section panels, so
          the dropdowns switched themselves off and a reader on a laptop could not
          reach Middle East or Football without opening a menu.
        */}
        <div className="flex h-16 items-center justify-between gap-4 md:h-14">
          <Link to="/" className="flex shrink-0 items-center gap-2 font-extrabold tracking-tight text-[#062b52] dark:text-blue-300" aria-label="RADAR Home">
            {/* Bigger on purpose: the owner asked for the masthead name to carry
                more of the page. The mark and the letters grow together, and 46px
                still clears the 56px row this line is measured to on desktop and
                the 64px one it uses on a phone, so nothing here pushes the search
                box or the sign-in button off the row. */}
            <RadarLogo size={46} wordmark hideWordmarkOnSmallScreens />
          </Link>

          {variant !== 'public' && (
            <div className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex">
              {navLinkItems}
            </div>
          )}

          <div className="flex min-w-0 shrink-0 items-center gap-1 sm:gap-3">
            {/* Below md the search lives in the menu; it is the one thing on this
                row that gives its width back rather than pushing the name out. */}
            {variant === 'public' && (
              <form onSubmit={handleSearch} className="relative hidden md:block md:w-40 lg:w-56" role="search">
                <label htmlFor="site-search" className="sr-only">{t('search.placeholder')}</label>
                <input
                  id="site-search"
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder={t('search.placeholder')}
                  className="w-full rounded-full border border-slate-200 bg-slate-50 py-1.5 pl-3.5 pr-8 text-xs text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                />
                <button type="submit" aria-label={t('nav.search')} className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-500 hover:text-blue-700">
                  <Search className="h-3.5 w-3.5" />
                </button>
              </form>
            )}

            {variant === 'public' && (
              /* The radio and the TV are the two things on this row that a phone
                 does not need twice: both also sit at the end of the section
                 strip directly underneath, and again in the menu. Kept here from
                 640px up, where there is room for them. */
              <div className="hidden items-center gap-1 sm:flex">
                <RadioNewsButton />
                <LiveButton />
              </div>
            )}

            <LanguageSelector className="hidden sm:block" labelClassName="hidden xl:inline" buttonClassName="border-gray-200 bg-transparent text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800" />

            {variant === 'public' && <NotificationsBell />}

            {token ? (
              <div className="relative">
                <button
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  aria-expanded={isProfileOpen}
                  aria-haspopup="true"
                >
                  <Avatar
                    src={user?.avatar}
                    name={user?.fullName || user?.username}
                    className="h-8 w-8 bg-brand-100 dark:bg-brand-900"
                    textClassName="text-sm font-medium text-brand-600 dark:text-brand-400"
                  />
                  <span className="hidden lg:block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {user?.fullName || user?.username}
                  </span>
                </button>

                {isProfileOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsProfileOpen(false)} aria-hidden="true" />
                    <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 dark:ring-white dark:ring-opacity-10 focus:outline-none z-50">
                      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{user?.fullName}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.email}</p>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300 mt-1">
                          {roleLabel(user?.role)}
                        </span>
                      </div>
                      <div className="py-1">
                        {/* Offered to anybody who has a desk to go to. The way to
                            know that is the permission list: an account with no
                            job at all lands on the public site, so its home would
                            be the home page it is already standing on. */}
                        {(variant !== 'public' || deskHomeFor(user) !== '/') && (
                          <Link
                            to={deskHomeFor(user)}
                            onClick={() => setIsProfileOpen(false)}
                            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            <LayoutDashboard className="h-4 w-4" />
                            {t('nav.dashboard')}
                          </Link>
                        )}
                        {user?._id && (
                          <Link
                            to={variant === 'public' ? `/user/${user._id}` : '/writer/profile'}
                            onClick={() => setIsProfileOpen(false)}
                            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            <User className="h-4 w-4" />
                            {t('nav.profile')}
                          </Link>
                        )}
                        {user?._id && (
                          <Link
                            to="/library"
                            onClick={() => setIsProfileOpen(false)}
                            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            <Bookmark className="h-4 w-4" />
                            {t('nav.library')}
                          </Link>
                        )}
                        {!canWrite && !isStaff(user) && variant === 'public' && (
                          <Link
                            to="/writer/dashboard"
                            onClick={() => setIsProfileOpen(false)}
                            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            <LayoutDashboard className="h-4 w-4" />
                            {t('writer.becomeCta')}
                          </Link>
                        )}
                        <Link
                          to={variant === 'public' && user?._id ? `/user/${user._id}#settings` : '/writer/profile#settings'}
                          onClick={() => setIsProfileOpen(false)}
                          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          <Settings className="h-4 w-4" />
                          {t('nav.settings')}
                        </Link>
                        <button
                          onClick={logout}
                          className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          <LogOut className="h-4 w-4" />
                          {t('nav.logout')}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              /* Signing in lives on the masthead at every width. It used to be
                 hidden below 640px because the bottom bar ended in the same
                 sign-in, and a reader looking for a way in was left to find the
                 hamburger and open it. The bar is four destinations now, so the
                 way in is back where the rest of the site's chrome is - and on a
                 phone it takes the shorter words and the tighter padding. */
              <div className={`items-center gap-1.5 sm:gap-3 ${variant === 'public' ? 'flex' : 'hidden md:flex'}`}>
                <Link
                  to="/login"
                  className="px-2 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:text-brand-600 dark:hover:text-brand-400 transition-colors sm:px-4 sm:py-2 sm:text-sm sm:font-medium"
                >
                  {t('nav.login')}
                </Link>
                <Link
                  to="/register"
                  className="rounded-full bg-[#062b52] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#041f3a] dark:bg-blue-600 dark:hover:bg-blue-500 sm:px-4 sm:py-2"
                >
                  {t('nav.register')}
                </Link>
              </div>
            )}

            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-expanded={isMenuOpen}
              aria-controls="mobile-menu"
              aria-label="Toggle menu"
            >
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/*
          Every section on its own line under the name, and it has the whole width
          to itself: this is what lets a reader hover World and get Middle East, or
          Sport and get Football, on a normal laptop rather than only on a
          27-inch monitor.
        */}
        {variant === 'public' && (
          <div className="hidden h-11 items-center border-t border-gray-100 dark:border-gray-800 md:flex">
            <SectionNav className="min-w-0 flex-1" extraLinks={navLinks} />
          </div>
        )}

        {/*
          On a phone the sections are not hidden behind the menu: they run past on
          their own strip under the masthead, because nine names will never fit
          across 360 pixels and a reader should not have to open anything to reach
          Sport. It stops for a finger, and the menu still carries the same links
          with their sub-sections.
        */}
        {variant === 'public' && (
          <div className="h-11 border-t border-gray-100 dark:border-gray-800 md:hidden">
            <SectionNav
              layout="marquee"
              extraLinks={navLinks}
              trailing={[<RadioNewsButton key="radio" />, <LiveButton key="live" />]}
            />
          </div>
        )}

      </nav>

      {/*
        The collapsible menu is outside the measured navigation on purpose. The
        page under the header is offset by however tall that navigation is, and a
        menu that pushes the page down every time someone opens it is a bug
        readers would feel on every page of the site.
      */}
      {isMenuOpen && (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div id="mobile-menu" className="md:hidden py-4 border-t border-gray-200 dark:border-gray-700">
            <div className="space-y-2">
              {/* On a phone the search lives here instead of the slim top bar. */}
              <form onSubmit={handleSearch} className="relative md:hidden" role="search">
                <label htmlFor="mobile-site-search" className="sr-only">{t('search.placeholder')}</label>
                <input
                  id="mobile-site-search"
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder={t('search.placeholder')}
                  className="w-full rounded-full border border-gray-200 bg-gray-50 py-2 pl-4 pr-10 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                />
                <button type="submit" aria-label={t('nav.search')} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-gray-500 hover:text-blue-700">
                  <Search className="h-4 w-4" />
                </button>
              </form>
              <nav className="grid gap-1" aria-label="Site sections">
                {variant === 'public' ? (
                  <>
                    <SectionNav layout="stack" extraLinks={navLinks} onNavigate={() => setIsMenuOpen(false)} />
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <RadioNewsButton />
                      <LiveButton />
                    </div>
                  </>
                ) : currentNavLinks.map((link) => (
                  <NavLink
                    key={link.href}
                    to={link.href}
                    onClick={() => setIsMenuOpen(false)}
                    className={({ isActive }) =>
                      `rounded-lg px-3 py-2 text-sm font-bold underline-offset-4 transition ${
                        isActive
                          ? 'bg-brand-600 text-white shadow-sm decoration-2 hover:underline dark:bg-blue-600'
                          : 'text-gray-800 decoration-2 hover:text-brand-600 hover:underline dark:text-gray-200 dark:hover:text-brand-400'
                      }`
                    }
                  >
                    {link.label}
                  </NavLink>
                ))}
              </nav>
              <LanguageSelector className="w-full [&>button]:w-full" />
              {token ? (
                <button
                  onClick={() => { setIsMenuOpen(false); logout() }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-gray-100 dark:text-red-400 dark:hover:bg-gray-800"
                >
                  <LogOut className="h-5 w-5" aria-hidden="true" />
                  {t('nav.logout')}
                </button>
              ) : (
                <div className="space-y-2 border-t border-gray-200 pt-3 dark:border-gray-700">
                  <Link to="/login" onClick={() => setIsMenuOpen(false)} className="block px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('nav.login')}
                  </Link>
                  <Link
                    to="/register"
                    onClick={() => setIsMenuOpen(false)}
                    className="block rounded-lg bg-[#062b52] px-4 py-2 text-center text-sm font-semibold text-white"
                  >
                    {t('nav.register')}
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
