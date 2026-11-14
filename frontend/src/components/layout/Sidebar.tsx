import { NavLink } from 'react-router-dom'
import { LayoutDashboard, PenTool, DollarSign, User, List, Settings, Users, Sparkles, ChevronLeft, ChevronRight, Inbox, MessageSquare } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../context/I18nContext'
import Avatar from '../common/Avatar'

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
      { href: '/editor/comments', label: t('nav.editor.comments'), icon: MessageSquare },
      // Editors write stories too, and their own shelf is a different thing
      // from the queue of everyone else's.
      { href: '/editor/articles', label: t('nav.writer.myArticles'), icon: PenTool },
      { href: '/editor/earnings', label: t('nav.writer.earnings'), icon: DollarSign },
      { href: '/editor/profile', label: t('nav.writer.profile'), icon: User },
    ],
    admin: [
      { href: '/mugishaimekevin/dashboard', label: t('nav.admin.dashboard'), icon: LayoutDashboard },
      { href: '/mugishaimekevin/users', label: t('nav.admin.users'), icon: Users },
      { href: '/mugishaimekevin/writers', label: t('nav.admin.writers'), icon: PenTool },
      { href: '/mugishaimekevin/articles', label: t('nav.admin.news'), icon: List },
      // The moderation desk is the same screen the editors use: one queue, two
      // staff roles allowed to decide what readers see.
      { href: '/editor/comments', label: t('nav.editor.comments'), icon: MessageSquare },
      { href: '/mugishaimekevin/ai-writer', label: t('nav.admin.aiWriter'), icon: Sparkles },
      { href: '/mugishaimekevin/payouts', label: t('nav.admin.payouts'), icon: DollarSign },
      { href: '/mugishaimekevin/messages', label: t('nav.admin.messages'), icon: Inbox },
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
              <Avatar
                src={user?.avatar}
                name={user?.fullName || user?.username}
                className="h-8 w-8 flex-shrink-0 bg-blue-600"
                textClassName="text-sm font-medium text-white"
              />
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