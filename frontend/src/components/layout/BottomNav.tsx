import { Link, useLocation } from 'react-router-dom'
import { Home, LayoutGrid, User, List } from 'lucide-react'
import { useI18n } from '../../context/I18nContext'
import { useAuth } from '../../context/AuthContext'

/**
 * The four things a reader on a phone actually reaches for.
 *
 * This bar has been asked for a search icon and then asked for a way in, twice
 * each, and the reason it can only hold four destinations is that the fifth makes
 * every label too small to read. Searching moved to the line under the masthead,
 * where it is a box you type in rather than an icon you hope opens something, so
 * this end of the bar is free to be the account again: "Profile" once you have
 * signed in, "Login" while you have not.
 */
export default function BottomNav() {
  const location = useLocation()
  const { user } = useAuth()
  const { t } = useI18n()
  const isActive = (path: string) => location.pathname === path
  // A member goes to their own page, the same address the header's avatar uses;
  // the desk profile is the fallback for an account the API has not handed an id
  // for in this session, which is rare enough that it should never 404.
  const accountHref = user?._id ? `/user/${user._id}` : '/writer/profile'

  return (
    <nav translate="no" className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="mx-auto flex min-h-16 max-w-md items-center justify-around px-2 py-2">
        <Link to="/" className={`flex flex-col items-center gap-1 text-xs ${isActive('/') ? 'text-blue-700' : 'text-slate-600'}`}>
          <Home className="h-5 w-5" />
          <span>{t('nav.home')}</span>
        </Link>
        <Link to="/articles" className={`flex flex-col items-center gap-1 text-xs ${isActive('/articles') ? 'text-blue-700' : 'text-slate-600'}`}>
          <List className="h-5 w-5" />
          <span>{t('nav.articles')}</span>
        </Link>
        {/* Writing happens in the writer dashboard, so the phone bar carries the
            sections instead of a publish button. */}
        <Link to="/categories" className={`flex flex-col items-center gap-1 text-xs ${isActive('/categories') ? 'text-blue-700' : 'text-slate-600'}`}>
          <LayoutGrid className="h-5 w-5" />
          <span>{t('nav.categories')}</span>
        </Link>
        {/* One icon, two honest names: it says what it opens, and it never shows
            a "Profile" that would land a visitor on a page they cannot see. */}
        <Link
          to={user ? accountHref : '/login'}
          className={`flex flex-col items-center gap-1 text-xs ${isActive(accountHref) || isActive('/login') ? 'text-blue-700' : 'text-slate-600'}`}
        >
          <User className="h-5 w-5" />
          <span>{user ? t('nav.profile') : t('nav.login')}</span>
        </Link>
      </div>
    </nav>
  )
}
