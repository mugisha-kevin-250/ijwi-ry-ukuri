import { Link, useLocation } from 'react-router-dom'
import { Home, LayoutGrid, Search, List } from 'lucide-react'
import { useI18n } from '../../context/I18nContext'

/**
 * The four things a reader on a phone actually reaches for.
 *
 * This bar used to end in a person icon that was "Login" to a visitor and "Profile"
 * to a member. Both halves of that were in the way: a visitor is not looking for a
 * login box at the bottom of the screen, and the account is already in the header
 * the moment anybody signs in. So the bar is Home, News, Search and Categories, and
 * signing in happens at the top, where the rest of the site's chrome lives.
 */
export default function BottomNav() {
  const location = useLocation()
  const { t } = useI18n()
  const isActive = (path: string) => location.pathname === path

  return (
    <nav translate="no" className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white md:hidden">
      <div className="mx-auto flex max-w-md items-center justify-around px-2 py-2">
        <Link to="/" className={`flex flex-col items-center gap-1 text-xs ${isActive('/') ? 'text-blue-700' : 'text-slate-600'}`}>
          <Home className="h-5 w-5" />
          <span>{t('nav.home')}</span>
        </Link>
        <Link to="/articles" className={`flex flex-col items-center gap-1 text-xs ${isActive('/articles') ? 'text-blue-700' : 'text-slate-600'}`}>
          <List className="h-5 w-5" />
          <span>{t('nav.articles')}</span>
        </Link>
        {/* Searching is the one thing a reader reaches for on a phone and could
            not find here: the header box is scrolled away by then, and the top
            bar is full of beats. This opens the desk that looks through both
            the stories and the writers who filed them. */}
        <Link to="/search" className={`flex flex-col items-center gap-1 text-xs ${isActive('/search') ? 'text-blue-700' : 'text-slate-600'}`}>
          <Search className="h-5 w-5" />
          <span>{t('nav.search')}</span>
        </Link>
        {/* Writing happens in the writer dashboard, so the phone bar carries the
            sections instead of a publish button. */}
        <Link to="/categories" className={`flex flex-col items-center gap-1 text-xs ${isActive('/categories') ? 'text-blue-700' : 'text-slate-600'}`}>
          <LayoutGrid className="h-5 w-5" />
          <span>{t('nav.categories')}</span>
        </Link>
      </div>
    </nav>
  )
}
