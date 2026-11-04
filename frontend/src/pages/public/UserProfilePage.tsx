import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Eye, Heart, MessageCircle, Users, Edit2, Camera, Monitor, Moon, Sun } from 'lucide-react'
import { userAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../context/I18nContext'
import { useTheme, type ThemeMode } from '../../context/ThemeContext'
import LanguageSelector from '../../components/layout/LanguageSelector'
import { apiClient } from '../../services/apiClient'

const THEME_OPTIONS: { value: ThemeMode; labelKey: string; icon: typeof Sun }[] = [
  { value: 'light', labelKey: 'settings.themeLight', icon: Sun },
  { value: 'dark', labelKey: 'settings.themeDark', icon: Moon },
  { value: 'system', labelKey: 'settings.themeSystem', icon: Monitor },
]

export default function UserProfilePage() {
  const { id } = useParams()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<{ fullName: string; bio: string; username: string; avatar: string; avatarFile: File | null }>({ fullName: '', bio: '', username: '', avatar: '', avatarFile: null })
  const { user, updateProfile } = useAuth()
  const { t } = useI18n()
  const { theme, setTheme } = useTheme()
  const profileId = id ?? user?._id
  const isOwnProfile = !!user && !!profileId && user._id === profileId

  useEffect(() => {
    const load = async () => {
      try {
        const res = await userAPI.getProfile(profileId!)
        setData(res.data.data)
        if (res.data.data?.user) {
          setEditData({
            fullName: res.data.data.user.fullName || '',
            bio: res.data.data.user.bio || '',
            username: res.data.data.user.username || '',
            avatar: res.data.data.user.avatar || '',
            avatarFile: null
          })
        }
      } catch (e) {
        setData(null)
      } finally {
        setLoading(false)
      }
    }
    if (profileId) void load()
  }, [profileId])

  const handleSave = async () => {
    try {
      // Upload avatar if changed
      if (editData.avatarFile) {
        const formData = new FormData()
        formData.append('image', editData.avatarFile)
        const res = await fetch(`${apiClient.baseURL}/upload/image`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          body: formData
        })
        const json = await res.json()
        if (json.data?.url) {
          editData.avatar = json.data.url
        }
      }
      await userAPI.updateMe(editData)
      // Sync with AuthContext
      updateProfile({
        fullName: editData.fullName,
        bio: editData.bio,
        username: editData.username,
        avatar: editData.avatar
      })
      setEditing(false)
      // Reload data
      const res = await userAPI.getProfile(profileId!)
      setData(res.data.data)
    } catch (e) {
      console.error('Failed to update profile:', e)
    }
  }

  const handleCancel = () => {
    if (data?.user) {
      setEditData({
        fullName: data.user.fullName || '',
        bio: data.user.bio || '',
        username: data.user.username || '',
        avatar: data.user.avatar || '',
        avatarFile: null
      })
    }
    setEditing(false)
  }

  if (loading) return <div className="mx-auto max-w-5xl px-4 py-10">...</div>
  if (!data) return <div className="mx-auto max-w-5xl px-4 py-10">Ntibabonetse</div>

  const { user: profileUser, articles = [], stats = {} } = data

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-6 rounded-2xl border border-[var(--color-border)] bg-white dark:bg-[var(--color-bg)] p-6 shadow-sm">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <div className="relative">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--color-brand-light)] text-2xl font-bold text-[var(--color-brand-text)]">
              {editing && editData.avatar ? (
                <img src={editData.avatar} alt="" className="h-20 w-20 rounded-full object-cover" />
              ) : profileUser.avatar ? (
                <img src={profileUser.avatar} alt="" className="h-20 w-20 rounded-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-[var(--color-brand-text)]">{profileUser.fullName?.[0]}</span>
              )}
            </div>
            {editing && (
              <label className="absolute bottom-0 right-0 cursor-pointer">
                <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    setEditData(prev => ({ ...prev, avatarFile: file }))
                    // Preview
                    const reader = new FileReader()
                    reader.onload = (e) => {
                      setEditData(prev => ({ ...prev, avatar: e.target?.result as string }))
                    }
                    reader.readAsDataURL(file)
                  }
                }} />
                <div className="absolute bottom-0 right-0 bg-[var(--color-brand)] text-white p-2 rounded-full shadow-lg">
                  <Camera className="h-4 w-4" />
                </div>
              </label>
            )}
          </div>
          <div className="flex-1 text-center sm:text-left">
            {editing ? (
              <div className="space-y-3 w-full">
                <input
                  type="text"
                  value={editData.fullName}
                  onChange={(e) => setEditData({ ...editData, fullName: e.target.value })}
                  className="input-field text-xl font-extrabold text-center sm:text-left"
                  placeholder={t('profile.fullName')}
                />
                <input
                  type="text"
                  value={editData.username}
                  onChange={(e) => setEditData({ ...editData, username: e.target.value })}
                  className="input-field text-sm text-center sm:text-left"
                  placeholder={t('profile.username')}
                />
                <textarea
                  value={editData.bio}
                  onChange={(e) => setEditData({ ...editData, bio: e.target.value })}
                  className="input-field text-sm text-center sm:text-left min-h-[80px]"
                  placeholder={t('profile.bio')}
                  rows={3}
                />
                <div className="flex justify-center sm:justify-start gap-2">
                  <button onClick={handleSave} className="btn-primary">
                    {t('profile.save')}
                  </button>
                  <button onClick={handleCancel} className="btn-secondary">
                    {t('profile.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h1 className="text-xl font-extrabold text-[var(--color-text)]">{profileUser.fullName}</h1>
                <p className="text-sm text-[var(--color-text-muted)]">@{profileUser.username}</p>
                {profileUser.bio && <p className="mt-2 text-sm text-[var(--color-text-muted)]">{profileUser.bio}</p>}
                <div className="mt-4 flex flex-wrap justify-center gap-4 text-sm text-[var(--color-text-muted)] sm:justify-start">
                  <div className="flex items-center gap-2"><span className="font-bold">{stats.totalArticles || articles.length}</span><span>{t('profile.articles')}</span></div>
                  <div className="flex items-center gap-2"><Users className="h-4 w-4" /><span className="font-bold">{stats.followers || 0}</span><span>{t('profile.followers')}</span></div>
                  <div className="flex items-center gap-2"><span className="font-bold">{stats.following || 0}</span><span>{t('profile.following')}</span></div>
                  <div className="flex items-center gap-2"><Heart className="h-4 w-4" /><span className="font-bold">{stats.totalLikes || 0}</span><span>{t('profile.likes')}</span></div>
                  <div className="flex items-center gap-2"><Eye className="h-4 w-4" /><span className="font-bold">{stats.totalViews || 0}</span><span>{t('profile.views')}</span></div>
                </div>
                {isOwnProfile && (
                  <button
                    onClick={() => setEditing(true)}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-brand-light)] text-[var(--color-brand-text)] font-medium hover:bg-opacity-80 transition-colors"
                  >
                    <Edit2 className="h-4 w-4" />
                    {t('profile.edit')}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-white dark:bg-[var(--color-bg)] p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-[var(--color-text)]">{t('profile.articles')}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article: any) => (
            <Link key={article._id} to={`/article/${article.slug}`} className="card p-4 shadow-sm">
              <p className="line-clamp-2 text-base font-bold text-[var(--color-text)]">{article.title}</p>
              <p className="mt-1 line-clamp-2 text-sm text-[var(--color-text-muted)]">{article.summary}</p>
              <div className="mt-3 flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
                <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{article.views || 0}</span>
                <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{article.likes || 0}</span>
                <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{article.commentsCount || 0}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {isOwnProfile && (
        <div id="settings" className="mt-6 rounded-2xl border border-[var(--color-border)] bg-white dark:bg-[var(--color-bg)] p-6 shadow-sm">
          <h2 className="text-lg font-bold text-[var(--color-text)]">{t('settings.title')}</h2>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">{t('settings.language')}</p>
              <p className="text-sm text-[var(--color-text-muted)]">{t('settings.languageHint')}</p>
            </div>
            <LanguageSelector />
          </div>
          <div className="mt-4 flex flex-col gap-2 border-t border-[var(--color-border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">{t('settings.theme')}</p>
              <p className="text-sm text-[var(--color-text-muted)]">{t('settings.themeHint')}</p>
            </div>
            <div role="group" aria-label={t('settings.theme')} className="inline-flex shrink-0 rounded-lg border border-[var(--color-border)] p-0.5">
              {THEME_OPTIONS.map((option) => {
                const Icon = option.icon
                const isActive = theme === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setTheme(option.value)}
                    aria-pressed={isActive}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-[var(--color-brand)] text-white'
                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {t(option.labelKey)}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}