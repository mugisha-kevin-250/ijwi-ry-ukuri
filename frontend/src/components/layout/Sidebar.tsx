import { NavLink } from 'react-router-dom'
import { LayoutDashboard, PenTool, DollarSign, User, List, Settings, Users, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../context/I18nContext'

interface SidebarProps {
  variant: 'writer' | 'editor' | 'admin'
  isCollapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
}

export default function Sidebar({ variant, isCollapsed, onCollapsedChange }: SidebarProps) {
  const { user } = useAuth()
  const { t } = useI18n()

const navigation = {
    writer: [
      { href: '/writer/dashboard', label: t('nav.writer.dashboard'), icon: LayoutDashboard },
      { href: '/writer/articles', label: t('nav.writer.myArticles'), icon: PenTool },
      { href: '/writer/earnings', label: t('nav.writer.earnings'), icon: DollarSign },
      { href: '/writer/profile', label: t('nav.writer.profile'), icon: User },
    ],
    editor: [
      { href: '/editor/dashboard', label: t('nav.editor.dashboard'), icon: LayoutDashboard },
      { href: '/editor/pending', label: t('nav.editor.pending'), icon: List },
    ],
    admin: [
      { href: '/mugishaimekevin/dashboard', label: t('nav.admin.dashboard'), icon: LayoutDashboard },
      { href: '/mugishaimekevin/users', label: t('nav.admin.users'), icon: Users },
      { href: '/mugishaimekevin/articles', label: t('nav.admin.news'), icon: List },
      { href: '/mugishaimekevin/payouts', label: t('nav.admin.payouts'), icon: DollarSign },
      { href: '/categories', label: t('nav.admin.categories'), icon: Settings },
      { href: '/mugishaimekevin/settings', label: t('nav.admin.settings'), icon: Settings },
    ],
  }

  const labels = {
    writer: t('nav.write'),
    editor: 'Editor Portal',
    admin: 'Admin Portal',
  }

  const icons = {
    writer: PenTool,
    editor: List,
    admin: Settings,
  }

  const navItems = navigation[variant]
  const Icon = icons[variant]

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 w-16 bg-[#071d31] text-white transition-all duration-300 ${
        isCollapsed ? 'md:w-16' : 'md:w-64'
      }`}
      aria-label={`${labels[variant]} navigation`}
    >
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-6 w-6 text-cyan-300" aria-hidden="true" />
          {!isCollapsed && (
            <span className="hidden truncate text-lg font-bold text-white md:block">
              RwandaNow
            </span>
          )}
        </div>
        <button
          onClick={() => onCollapsedChange(!isCollapsed)}
          className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
        {navItems.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`
            }
            title={isCollapsed ? item.label : undefined}
          >
            <item.icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
            {!isCollapsed && <span className="hidden truncate md:block">{item.label}</span>}
          </NavLink>
        ))}

        {!isCollapsed && (
          <div className="mt-6 hidden border-t border-white/10 pt-6 md:block">
            <div className="flex items-center gap-3 px-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-600">
                {user?.avatar ? (
                  <img src={user.avatar} alt="" className="h-8 w-8 rounded-full" />
                ) : (
                  <span className="text-sm font-medium text-white">
                    {user?.fullName?.[0] || user?.username?.[0] || 'U'}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {user?.fullName || user?.username}
                </p>
                <p className="truncate text-xs capitalize text-slate-400">
                  {user?.role?.toLowerCase()}
                </p>
              </div>
            </div>
          </div>
        )}
      </nav>
    </aside>
  )
}