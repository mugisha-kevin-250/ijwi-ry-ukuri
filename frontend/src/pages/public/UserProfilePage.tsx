import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Eye, Heart, MessageCircle, Users, Edit2, Camera, Moon, Sun } from 'lucide-react'
import { userAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../context/I18nContext'
import { useTheme, type ThemeMode } from '../../context/ThemeContext'
import LanguageSelector from '../../components/layout/LanguageSelector'
import { uploadImage } from '../../services/apiClient'
import Avatar from '../../components/common/Avatar'
import NewsAlertsCard from '../../components/pwa/NewsAlertsCard'
import EmailAlertsCard from '../../components/pwa/EmailAlertsCard'
import CloseAccountCard from '../../components/account/CloseAccountCard'
import { useSeo, absoluteSiteUrl } from '../../utils/useSeo'
import { toast } from 'react-toastify'

const THEME_OPTIONS: { value: ThemeMode; labelKey: string; icon: typeof Sun }[] = [
  { value: 'light', labelKey: 'settings.themeLight', icon: Sun },
  { value: 'dark', labelKey: 'settings.themeDark', icon: Moon },
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

  // This address is published in the sitemap, and it is where a reader goes when they
  // want to know who wrote the story they just finished. Before this it was an
  // untagged route, so it inherited the home page's title, description and canonical -
  // which is how every author page on the site was quietly telling Google it was a
  // duplicate of the front page. It now says who it is, and carries the Person record
  // the publisher pages have been waiting for, built only from what the profile
  // actually holds: the name, the handle, the line they wrote about themselves, the
  // picture they chose.
  //
  // A profile with nothing published under it is somebody's own account rather than a
  // byline, and that belongs out of the index instead - see useSeo.
  const author = data?.user
  const publishedCount = Array.isArray(data?.articles) ? data.articles.length : 0
  const isWriter = publishedCount > 0
  useSeo({
    title: author?.fullName,
    description: author?.bio
      || (author?.fullName && isWriter
        ? `${publishedCount} ${publishedCount === 1 ? 'story' : 'stories'} published on RADAR by ${author.fullName}.`
        : undefined),
    path: profileId ? `/user/${profileId}` : undefined,
    image: author?.avatar,
    // Only once the page knows what it is. A profile that is still being fetched is
    // not yet known to be empty, and a crawler that renders during that second
    // would be told to drop a byline that was about to turn out to hold thirty
    // stories. A profile that has finished loading with nothing published under it
    // - or that failed to load at all - is the one that stays out of the index.
    noindex: !loading && !isWriter,
    jsonLd: author && isWriter && profileId
      ? {
          '@context': 'https://schema.org',
          '@type': 'ProfilePage',
          url: absoluteSiteUrl(`/user/${profileId}`),
          mainEntity: {
            '@type': 'Person',
            name: author.fullName,
            url: absoluteSiteUrl(`/user/${profileId}`),
            ...(author.avatar ? { image: author.avatar } : {}),
            ...(author.bio ? { description: author.bio } : {}),
            ...(author.username ? { identifier: `@${author.username}` } : {}),
          },
          publisher: { '@type': 'Organization', name: 'RADAR', url: absoluteSiteUrl('/') },
        }
      : undefined,
  })

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
    let avatar = editData.avatar
    try {
      if (editData.avatarFile) {
        avatar = await uploadImage(editData.avatarFile)
      }
      await userAPI.updateMe({
        fullName: editData.fullName,
        bio: editData.bio,
        username: editData.username,
        avatar,
      })
      // Sync with AuthContext
      updateProfile({
        fullName: editData.fullName,
        bio: editData.bio,
        username: editData.username,
        avatar
      })
      setEditing(false)
      // Reload data
      const res = await userAPI.getProfile(profileId!)
      setData(res.data.data)
    } catch (e) {
      console.error('Failed to update profile:', e)
      toast.error(e instanceof Error ? e.message : 'Failed to update profile')
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
            <Avatar
              src={editing ? editData.avatar : profileUser.avatar}
              name={profileUser.fullName}
              className="h-20 w-20 bg-[var(--color-brand-light)]"
              textClassName="text-2xl font-bold text-[var(--color-brand-text)]"
            />
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
        <div className="mt-6 space-y-6">
          <NewsAlertsCard />
          <EmailAlertsCard />
        </div>
      )}

      {isOwnProfile && (
        <div className="mt-6">
          <CloseAccountCard />
        </div>
      )}

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