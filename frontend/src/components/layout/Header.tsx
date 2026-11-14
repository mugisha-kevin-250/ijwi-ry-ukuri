import React, { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Menu, X, User, Bookmark, LogOut, LayoutDashboard, Settings, Search } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../context/I18nContext'
import Avatar from '../common/Avatar'
import RadarLogo from '../common/RadarLogo'
import LanguageSelector from './LanguageSelector'
import LiveButton from './LiveButton'
import RadioNewsButton from './RadioNewsButton'
import NotificationsBell from './NotificationsBell'
import SectionNav from './SectionNav'

interface HeaderProps {
  variant?: 'public' | 'writer' | 'editor' | 'admin'
  sidebarCollapsed?: boolean
}

export default function Header({ variant = 'public', sidebarCollapsed = false }: HeaderProps) {
  const { user, logout, token } = useAuth()
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [searchValue, setSearchValue] = useState('')

  // The section nav is the site's navigation. These sat beside the old category
  // strip, which is gone, so only the full index stays and it reads as "All news".
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
    { href: '/categories', label: t('nav.admin.categories') },
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
  const canWrite = user?.role === 'WRITER' || user?.role === 'ADMIN'

  // A newspaper puts today's date on the masthead. It is printed in the language
  // the reader is reading in, and Intl falls back on its own for a locale the
  // device has no data for.
  const today = useMemo(
    () => new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()),
    [lang],
  )

  const navLinkItems = currentNavLinks.map((link) => (
    <NavLink
      key={link.href}
      to={link.href}
      className={({ isActive }) =>
        `shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-bold underline-offset-4 transition ${
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
    const onScroll = () => setIsScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      translate="no"
      className={`fixed top-0 right-0 z-50 border-b bg-white transition-shadow dark:bg-gray-900 ${
        isScrolled ? 'border-gray-200 shadow-md dark:border-gray-700' : 'border-gray-200 dark:border-gray-700'
      } ${variant === 'public' ? 'left-0' : sidebarCollapsed ? 'left-16' : 'left-16 md:left-64'}`}
    >
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8" aria-label="Main navigation">
        {/*
          The date and the way in (search, sign in) sit on a slim bar of their own
          so the row under it can hold the name and every section on one line.
          Under md that second line of chrome is dropped; the menu carries the same.
        */}
        {variant === 'public' && (
          <div className="hidden h-9 items-center justify-between gap-4 border-b border-gray-100 text-xs dark:border-gray-800 md:flex">
            <p className="flex min-w-0 items-center gap-2 text-gray-500 dark:text-gray-400">
              <span className="truncate font-semibold uppercase tracking-wide">{today}</span>
              <span className="hidden truncate lg:inline">{t('app.tagline')}</span>
            </p>
            <div className="flex shrink-0 items-center gap-3">
              <form onSubmit={handleSearch} className="relative">
                <label htmlFor="site-search" className="sr-only">{t('search.placeholder')}</label>
                <input
                  id="site-search"
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder={t('search.placeholder')}
                  className="w-56 rounded-full border border-slate-200 bg-slate-50 py-1.5 pl-3.5 pr-8 text-xs text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                />
                <button type="submit" aria-label={t('nav.search')} className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-500 hover:text-blue-700">
                  <Search className="h-3.5 w-3.5" />
                </button>
              </form>
              {!token && (
                <>
                  <Link to="/login" className="font-bold text-gray-600 transition hover:text-brand-600 dark:text-gray-300 dark:hover:text-brand-400">
                    {t('nav.login')}
                  </Link>
                  <Link
                    to="/register"
                    className="rounded-full bg-[#062b52] px-3 py-1 font-semibold text-white transition hover:bg-[#041f3a] dark:bg-blue-600 dark:hover:bg-blue-500"
                  >
                    {t('nav.register')}
                  </Link>
                </>
              )}
            </div>
          </div>
        )}

        <div className="flex h-16 items-center justify-between gap-4 md:h-14">
          <Link to="/" className="flex shrink-0 items-center gap-2 text-xl font-extrabold tracking-tight text-[#062b52] dark:text-blue-300" aria-label="RADAR Home">
            <RadarLogo size={30} wordmark hideWordmarkOnSmallScreens />
          </Link>

          {variant !== 'public' && (
            <div className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex">
              {navLinkItems}
            </div>
          )}

          {/* Sections on the same line as the name, the way a masthead reads.
              The row may not spill: SectionNav measures itself and scrolls when
              the names do not fit, which is what used to draw them over the
              radio, LIVE and language buttons. */}
          {variant === 'public' && (
            <div className="hidden min-w-0 flex-1 items-center gap-2 md:flex">
              <SectionNav className="min-w-0 flex-1" extraLinks={navLinks} />
              <RadioNewsButton />
              <LiveButton />
            </div>
          )}

          <div className="flex shrink-0 items-center gap-1 sm:gap-3">
            <LanguageSelector className="hidden sm:block" labelClassName="hidden lg:inline" buttonClassName="border-gray-200 bg-transparent text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800" />

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
                          {user?.role}
                        </span>
                      </div>
                      <div className="py-1">
                        {(variant !== 'public' || canWrite) && (
                          <Link
                            to={user?.role === 'ADMIN' ? '/mugishaimekevin/dashboard' : '/writer/dashboard'}
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
                        {!canWrite && variant === 'public' && (
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
              <div className={`items-center gap-3 ${variant === 'public' ? 'flex md:hidden' : 'hidden md:flex'}`}>
                <Link
                  to="/login"
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                >
                  {t('nav.login')}
                </Link>
                <Link
                  to="/register"
                  className="rounded-full bg-[#062b52] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#041f3a] dark:bg-blue-600 dark:hover:bg-blue-500"
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

        {isMenuOpen && (
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
        )}
      </nav>
    </header>
  )
}
