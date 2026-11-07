import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Check, Newspaper } from 'lucide-react'
import type { Article, Notification } from '../../types'
import { notificationAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../context/I18nContext'

const POLL_MS = 30000

function articleOf(notification: Notification): Article | null {
  return notification.relatedModel === 'Article' && notification.relatedEntity && typeof notification.relatedEntity === 'object'
    ? (notification.relatedEntity as Article)
    : null
}

// The admin inbox: every new story a writer publishes lands here, so nothing
// published while the tab is closed is missed on the next visit.
export default function NotificationsBell() {
  const { token } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [items, setItems] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const refresh = useCallback(async (skipGuard = false) => {
    if (!token || (!skipGuard && document.hidden)) return
    try {
      const response = await notificationAPI.getNotifications()
      const payload = response.data.data as { notifications?: Notification[]; unread?: number }
      setItems(payload.notifications || [])
      setUnread(Number(payload.unread) || 0)
    } catch {
      // A failed poll keeps whatever is already on screen.
    }
  }, [token])

  useEffect(() => {
    if (!token) {
      setItems([])
      setUnread(0)
      return
    }
    // The first read always runs; a background tab still has to show the badge
    // count the moment it is opened.
    void refresh(true)
    const timer = window.setInterval(() => void refresh(), POLL_MS)
    const onVisible = () => {
      if (!document.hidden) void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [token, refresh])

  useEffect(() => {
    if (!isOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [isOpen])

  const openItem = async (notification: Notification) => {
    setIsOpen(false)
    if (!notification.isRead) {
      setItems((current) => current.map((item) => (item._id === notification._id ? { ...item, isRead: true } : item)))
      setUnread((current) => Math.max(0, current - 1))
      try {
        await notificationAPI.markAsRead(notification._id)
      } catch {
        // Navigation matters more than the read flag.
      }
    }
    const article = articleOf(notification)
    if (article?.slug) navigate(`/article/${article.slug}`)
  }

  const markAll = async () => {
    setItems((current) => current.map((item) => ({ ...item, isRead: true })))
    setUnread(0)
    try {
      await notificationAPI.markAllAsRead()
    } catch {
      void refresh()
    }
  }

  if (!token) return null

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setIsOpen((open) => !open)}
        className="relative rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
        aria-label={`${t('notif.title')}${unread ? ` (${unread})` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-[min(92vw,20rem)] overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-black/5 dark:bg-gray-800 dark:ring-white/10">
          <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-700">
            <p className="text-sm font-bold text-gray-900 dark:text-white">{t('notif.title')}</p>
            {unread > 0 && (
              <button onClick={() => void markAll()} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline dark:text-cyan-300">
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                {t('notif.markAllRead')}
              </button>
            )}
          </div>
          <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto dark:divide-gray-700/60">
            {items.length === 0 && <li className="px-3 py-6 text-center text-xs text-gray-500 dark:text-gray-400">{t('notif.empty')}</li>}
            {items.map((item) => (
              <li key={item._id}>
                <button
                  onClick={() => void openItem(item)}
                  className={`flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm transition hover:bg-gray-50 dark:hover:bg-gray-700/60 ${
                    item.isRead ? 'text-gray-500 dark:text-gray-400' : 'font-semibold text-gray-900 dark:text-white'
                  }`}
                >
                  <Newspaper className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-cyan-300" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2">{item.message}</span>
                    <span className="mt-0.5 block text-[11px] font-normal text-gray-400">
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </span>
                  {!item.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500" aria-hidden="true" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
