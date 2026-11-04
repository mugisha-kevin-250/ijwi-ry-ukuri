import { Link, useLocation } from 'react-router-dom'
import { Home, PlusCircle, User, List } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../context/I18nContext'

export default function BottomNav() {
  const location = useLocation()
  const { user } = useAuth()
  const { t } = useI18n()
  const isActive = (path: string) => location.pathname === path

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white md:hidden">
      <div className="mx-auto flex max-w-md items-center justify-around px-2 py-2">
        <Link to="/" className={`flex flex-col items-center gap-1 text-xs ${isActive('/') ? 'text-blue-700' : 'text-slate-600'}`}>
          <Home className="h-5 w-5" />
          <span>{t('nav.home')}</span>
        </Link>
        <Link to="/articles" className={`flex flex-col items-center gap-1 text-xs ${isActive('/articles') ? 'text-blue-700' : 'text-slate-600'}`}>
          <List className="h-5 w-5" />
          <span>{t('nav.articles')}</span>
        </Link>
        <Link to="/writer/articles/new" className="flex flex-col items-center gap-1 text-xs text-blue-700">
          <PlusCircle className="h-6 w-6" />
          <span>{t('nav.write')}</span>
        </Link>
        <Link to={user ? `/user/${user._id}` : '/login'} className={`flex flex-col items-center gap-1 text-xs ${location.pathname.startsWith('/user/') ? 'text-blue-700' : 'text-slate-600'}`}>
          <User className="h-5 w-5" />
          <span>{user ? t('nav.profile') : t('nav.login')}</span>
        </Link>
      </div>
    </nav>
  )
}
