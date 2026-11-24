import { NavLink } from 'react-router-dom'
import { LayoutDashboard, PenTool, DollarSign, User, List, Settings, Users, Sparkles, ChevronLeft, ChevronRight, Inbox, Mail, MessageSquare, FolderTree, Megaphone, Timer, History, ClipboardList, Disc3, Globe2, Activity } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../context/I18nContext'
import { can, roleLabel } from '../../utils/deskAccess'
import Avatar from '../common/Avatar'

interface SidebarProps {
  variant: 'writer' | 'editor' | 'admin'
  isCollapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
}

export default function Sidebar({ variant, isCollapsed, onCollapsedChange }: SidebarProps) {
  const { user } = useAuth()
  const { t } = useI18n()

// Every link carries the job its screen asks the API for. The bar below shows
// only the links this account holds, so a member of staff never has to discover
// a desk by pressing the ones that refuse them - and the day a job moves between
// roles on the server, the newsroom's own navigation follows without anyone
// editing this file.
//
// This is presentation, not protection: the route gate and the API both answer
// for themselves. Hiding a link has never been a permission.
const navigation = {
    writer: [
      { href: '/writer/dashboard', label: t('nav.writer.dashboard'), icon: LayoutDashboard, permission: 'writeStories' as const },
      { href: '/writer/articles', label: t('nav.writer.myArticles'), icon: PenTool, permission: 'writeStories' as const },
      { href: '/writer/assignments', label: 'My assignments', icon: ClipboardList, permission: 'writeStories' as const },
      { href: '/writer/earnings', label: t('nav.writer.earnings'), icon: DollarSign, permission: 'writeStories' as const },
      { href: '/writer/profile', label: t('nav.writer.profile'), icon: User, permission: 'writeStories' as const },
    ],
    editor: [
      { href: '/editor/dashboard', label: t('nav.editor.dashboard'), icon: LayoutDashboard, permission: 'review' as const },
      { href: '/editor/pending', label: t('nav.editor.pending'), icon: List, permission: 'review' as const },
      { href: '/editor/assignments', label: 'Assignments', icon: ClipboardList, permission: 'review' as const },
      { href: '/editor/comments', label: t('nav.editor.comments'), icon: MessageSquare, permission: 'moderateComments' as const },
      // Editors write stories too, and their own shelf is a different thing
      // from the queue of everyone else's.
      { href: '/editor/articles', label: t('nav.writer.myArticles'), icon: PenTool, permission: 'writeStories' as const },
      { href: '/editor/earnings', label: t('nav.writer.earnings'), icon: DollarSign, permission: 'writeStories' as const },
      { href: '/editor/profile', label: t('nav.writer.profile'), icon: User, permission: 'writeStories' as const },
    ],
    admin: [
      { href: '/mugishaimekevin/dashboard', label: t('nav.admin.dashboard'), icon: LayoutDashboard, permission: 'viewNewsroomDesk' as const },
      { href: '/mugishaimekevin/users', label: t('nav.admin.users'), icon: Users, permission: 'viewNewsroomDesk' as const },
      { href: '/mugishaimekevin/writers', label: t('nav.admin.writers'), icon: PenTool, permission: 'manageUsers' as const },
      { href: '/mugishaimekevin/articles', label: t('nav.admin.news'), icon: List, permission: 'viewNewsroomDesk' as const },
      { href: '/mugishaimekevin/audit-log', label: 'Activity log', icon: History, permission: 'viewNewsroomDesk' as const },
      // The moderation desk is the same screen the editors use: one queue, and
      // every role that answers readers reaches it from here.
      { href: '/editor/comments', label: t('nav.editor.comments'), icon: MessageSquare, permission: 'moderateComments' as const },
      { href: '/mugishaimekevin/ai-writer', label: t('nav.admin.aiWriter'), icon: Sparkles, permission: 'runAiWriter' as const },
      { href: '/mugishaimekevin/payouts', label: t('nav.admin.payouts'), icon: DollarSign, permission: 'managePayouts' as const },
      { href: '/mugishaimekevin/messages', label: t('nav.admin.messages'), icon: Inbox, permission: 'moderateMessages' as const },
      // The relay that mails the codes and alerts, kept apart from the mail
      // readers send us: one is a queue to answer, the other is a machine to check.
      { href: '/mugishaimekevin/mail', label: t('nav.admin.mail'), icon: Mail, permission: 'managePlatform' as const },
      // Beside the mail desk, for the same reason: a machine that runs on a
      // clock needs a screen that says whether it ran.
      { href: '/mugishaimekevin/scheduler', label: t('nav.admin.scheduler'), icon: Timer, permission: 'managePlatform' as const },
      { href: '/mugishaimekevin/system-health', label: 'System health', icon: Activity, permission: 'managePlatform' as const },
      { href: '/mugishaimekevin/global-news', label: 'Global news desk', icon: Globe2, permission: 'managePlatform' as const },
      // Sections and advertising are desks of their own, and both used to be
      // missing or pointing at the reader's page instead of the admin's.
      { href: '/mugishaimekevin/categories', label: t('nav.admin.categories'), icon: FolderTree, permission: 'manageCategories' as const },
      { href: '/mugishaimekevin/advertising', label: t('nav.admin.advertising'), icon: Megaphone, permission: 'manageAds' as const },
      { href: '/mugishaimekevin/settings', label: t('nav.admin.settings'), icon: Settings, permission: 'manageSettings' as const },
      { href: '/mugishaimekevin/music', label: 'Music management', icon: Disc3, permission: 'manageMusic' as const },
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

  const navItems = navigation[variant].filter((item) => can(user, item.permission))
  const Icon = icons[variant]

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 hidden w-16 flex-col bg-[#071d31] text-white transition-all duration-300 md:flex ${
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
                  {roleLabel(user?.role)}
                </p>
              </div>
            </div>
          </div>
        )}
      </nav>
    </aside>
  )
}