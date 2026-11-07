import React, { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Menu, X, User, LogOut, LayoutDashboard, PenTool, Settings, Users, DollarSign, List, Search } from 'lucide-react'
import { toast } from 'react-toastify'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../context/I18nContext'
import Avatar from '../common/Avatar'
import LanguageSelector from './LanguageSelector'

interface HeaderProps {
  variant?: 'public' | 'writer' | 'editor' | 'admin'
  sidebarCollapsed?: boolean
}

export default function Header({ variant = 'public', sidebarCollapsed = false }: HeaderProps) {
  const { user, logout, token, becomeWriter } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [searchValue, setSearchValue] = useState('')

  const navLinks = [
    { href: '/', label: t('nav.home'), icon: LayoutDashboard },
    { href: '/articles', label: t('nav.articles'), icon: List },
    { href: '/categories', label: t('nav.categories'), icon: Settings },
    { href: '/search', label: t('nav.search'), icon: Search },
  ]

  const writerNavLinks = [
    { href: '/writer/dashboard', label: t('nav.writer.dashboard'), icon: LayoutDashboard },
    { href: '/writer/articles', label: t('nav.writer.myArticles'), icon: PenTool },
    { href: '/writer/profile', label: t('nav.writer.profile'), icon: User },
  ]

  const editorNavLinks = [
    { href: '/editor/dashboard', label: t('nav.editor.dashboard'), icon: LayoutDashboard },
    { href: '/editor/pending', label: t('nav.editor.pending'), icon: List },
  ]

  const adminNavLinks = [
    { href: '/mugishaimekevin/dashboard', label: t('nav.admin.dashboard'), icon: LayoutDashboard },
    { href: '/mugishaimekevin/users', label: t('nav.admin.users'), icon: Users },
    { href: '/mugishaimekevin/articles', label: t('nav.admin.news'), icon: List },
    { href: '/mugishaimekevin/payouts', label: t('nav.admin.payouts'), icon: DollarSign },
    { href: '/categories', label: t('nav.admin.categories'), icon: Settings },
    { href: '/mugishaimekevin/settings', label: t('nav.admin.settings'), icon: Settings },
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

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const query = searchValue.trim()
    if (query) navigate(`/search?search=${encodeURIComponent(query)}`)
  }

  const handleWrite = async () => {
    if (!token) {
      navigate('/login', { state: { from: '/writer/articles/new' } })
      return
    }
    if (canWrite) {
      navigate('/writer/articles/new')
      return
    }
    setIsApplying(true)
    try {
      await becomeWriter()
      navigate('/writer/articles/new')
    } catch (err: any) {
      toast.error(err.message || t('writer.becomeFailed'))
    } finally {
      setIsApplying(false)
    }
  }

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed top-0 right-0 z-50 border-b bg-white transition-shadow dark:bg-gray-900 ${
        isScrolled ? 'border-gray-200 shadow-md dark:border-gray-700' : 'border-gray-200 dark:border-gray-700'
      } ${variant === 'public' ? 'left-0' : sidebarCollapsed ? 'left-16' : 'left-16 md:left-64'}`}
    >
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8" aria-label="Main navigation">
        <div className="flex h-16 items-center gap-4">
          <Link to="/" className="flex shrink-0 items-center gap-2 text-xl font-extrabold tracking-tight text-[#062b52] dark:text-blue-300" aria-label="Ijwi ry'ukuri Home">
            <img src="/logo.png" alt="Ijwi ry'ukuri logo" className="h-8 w-8" onError={(e) => { e.currentTarget.src = '/favicon.svg'; }} />
            <span className="hidden sm:block">Ijwi ry<span className="text-blue-600 dark:text-cyan-300">'ukuri</span></span>
          </Link>

          <div className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex">
            {currentNavLinks.map((link) => (
              <NavLink
                key={link.href}
                to={link.href}
                className={({ isActive }) =>
                  `flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-400'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-brand-600 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-brand-400'
                  }`
                }
              >
                <link.icon className="h-4 w-4" aria-hidden="true" />
                {link.label}
              </NavLink>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-3">
            {variant === 'public' && (
              <form onSubmit={handleSearch} className="relative hidden lg:block">
                <label htmlFor="site-search" className="sr-only">{t('search.placeholder')}</label>
                <input id="site-search" value={searchValue} onChange={(event) => setSearchValue(event.target.value)} placeholder={t('search.placeholder')} className="w-60 rounded-full border border-slate-200 bg-slate-50 py-2 pl-4 pr-10 text-xs text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100" />
                <button type="submit" aria-label={t('nav.search')} className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-slate-500 hover:text-blue-700"><Search className="h-4 w-4" /></button>
              </form>
            )}

            <LanguageSelector className="hidden sm:block" buttonClassName="border-gray-200 bg-transparent text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800" />

            {variant === 'public' && (
              <button
                onClick={handleWrite}
                disabled={isApplying}
                className="hidden items-center gap-1.5 rounded-full bg-[#062b52] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#041f3a] disabled:opacity-60 md:inline-flex dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                <PenTool className="h-4 w-4" aria-hidden="true" />
                {isApplying ? t('writer.becomeBusy') : t('nav.write')}
              </button>
            )}

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
                  <span className="hidden sm:block text-sm font-medium text-gray-700 dark:text-gray-300">
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
                        {!canWrite && variant === 'public' && (
                          <button
                            onClick={() => { setIsProfileOpen(false); void handleWrite() }}
                            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            <PenTool className="h-4 w-4" />
                            {isApplying ? t('writer.becomeBusy') : t('writer.becomeCta')}
                          </button>
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
              <div className="hidden md:flex md:items-center md:gap-3">
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

        {isMenuOpen && (
          <div id="mobile-menu" className="md:hidden py-4 border-t border-gray-200 dark:border-gray-700">
            <div className="space-y-2">
              <nav className="grid gap-1" aria-label="Site sections">
                {currentNavLinks.map((link) => (
                  <Link
                    key={link.href}
                    to={link.href}
                    onClick={() => setIsMenuOpen(false)}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <link.icon className="h-4 w-4" aria-hidden="true" />
                    {link.label}
                  </Link>
                ))}
              </nav>
              <LanguageSelector className="w-full [&>button]:w-full" />
              {variant === 'public' && (
                <button
                  onClick={() => { setIsMenuOpen(false); void handleWrite() }}
                  disabled={isApplying}
                  className="flex w-full items-center gap-3 rounded-lg bg-[#062b52] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  <PenTool className="h-4 w-4" aria-hidden="true" />
                  {isApplying ? t('writer.becomeBusy') : canWrite ? t('nav.write') : t('writer.becomeCta')}
                </button>
              )}
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
