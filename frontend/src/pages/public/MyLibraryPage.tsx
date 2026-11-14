import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bookmark, Clock3, Loader2, X } from 'lucide-react'
import { articleAPI, userAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../context/I18nContext'
import { setBookmarkState, setFollowState } from '../../utils/engagementStore'
import { useSeo } from '../../utils/useSeo'
import Avatar from '../../components/common/Avatar'
import MediaImage from '../../components/common/MediaImage'
import EmptyState from '../../components/common/EmptyState'

interface SavedRow {
  _id: string
  savedAt?: string
  article: {
    _id: string
    title: string
    slug: string
    summary?: string
    featuredImage?: string
    readingTime?: number
    publishedAt?: string
    author?: { _id?: string; fullName?: string; username?: string }
  }
}

interface FollowRow {
  _id: string
  writer: {
    _id: string
    bio?: string
    user: { _id: string; fullName?: string; username?: string; avatar?: string; bio?: string }
  }
}

/**
 * The reader's own shelf. Both halves read the account lists the API already
 * kept, and every button here calls the endpoint that really removes the row,
 * so nothing on this page is a control that does nothing.
 */
export default function MyLibraryPage() {
  const { user } = useAuth()
  const { t } = useI18n()
  const [saved, setSaved] = useState<SavedRow[]>([])
  const [savedGone, setSavedGone] = useState(0)
  const [follows, setFollows] = useState<FollowRow[]>([])
  const [followsGone, setFollowsGone] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState('')

  useSeo({ title: t('library.title'), description: t('library.desc'), path: '/library' })

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const [bookmarks, following] = await Promise.all([userAPI.getBookmarks(), userAPI.getFollowing()])
      const savedPayload = bookmarks.data.data as { bookmarks?: SavedRow[]; unavailable?: number } | null
      setSaved(Array.isArray(savedPayload?.bookmarks) ? savedPayload.bookmarks : [])
      setSavedGone(Number(savedPayload?.unavailable || 0))
      const followPayload = following.data.data as { follows?: FollowRow[]; unavailable?: number } | null
      setFollows(Array.isArray(followPayload?.follows) ? followPayload.follows : [])
      setFollowsGone(Number(followPayload?.unavailable || 0))
    } catch {
      setLoadError(t('library.loadError'))
      setSaved([])
      setFollows([])
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (!user?._id) {
      setLoading(false)
      return
    }
    void load()
  }, [user?._id, load])

  const removeSaved = async (articleId: string) => {
    if (busy) return
    setBusy(`bookmark:${articleId}`)
    setActionError('')
    try {
      await articleAPI.unbookmarkArticle(articleId)
      setBookmarkState(articleId, false)
      setSaved((rows) => rows.filter((row) => row.article._id !== articleId))
    } catch {
      setActionError(t('library.removeFailed'))
    } finally {
      setBusy('')
    }
  }

  const unfollow = async (row: FollowRow) => {
    if (busy) return
    setBusy(`follow:${row.writer.user._id}`)
    setActionError('')
    try {
      await articleAPI.unfollowWriter(row.writer._id)
      setFollowState(String(row.writer.user._id), false)
      setFollows((rows) => rows.filter((item) => item._id !== row._id))
    } catch {
      setActionError(t('library.removeFailed'))
    } finally {
      setBusy('')
    }
  }

  const savedCount = saved.length
  const followedCount = follows.length

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <header className="mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight">{t('library.title')}</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{t('library.desc')}</p>
        </header>

        {actionError && (
          <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {actionError}
          </div>
        )}

        {!user ? (
          <EmptyState
            icon={<Bookmark className="h-8 w-8" />}
            title={t('library.signedOut')}
            description={t('library.signedOutDesc')}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link to="/login" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800">
                  {t('nav.login')}
                </Link>
                <Link to="/register" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50">
                  {t('nav.register')}
                </Link>
              </div>
            }
          />
        ) : loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('library.loading')}
          </div>
        ) : loadError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span>{loadError}</span>
            <div className="flex gap-3">
              <button type="button" onClick={() => void load()} className="font-bold underline">{t('home.retry')}</button>
              <Link to="/articles" className="font-bold text-blue-700 hover:underline">{t('home.browse')}</Link>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <section>
              <div className="mb-3 flex items-baseline justify-between border-b border-slate-200 pb-2">
                <h2 className="text-lg font-extrabold">{t('library.saved')}</h2>
                <span className="text-sm text-slate-500">
                  {savedCount === 1 ? `${savedCount} ${t('library.savedOne')}` : `${savedCount} ${t('library.savedMany')}`}
                </span>
              </div>
              {saved.length ? (
                <ul className="space-y-3">
                  {saved.map((row) => (
                    <li key={row._id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
                      <Link to={`/article/${row.article.slug}`} className="block h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                        {row.article.featuredImage ? (
                          <MediaImage src={row.article.featuredImage} className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-[10px] font-bold tracking-widest text-slate-400">RADAR</span>
                        )}
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link to={`/article/${row.article.slug}`} className="line-clamp-2 text-sm font-bold text-slate-900 hover:text-blue-800">
                          {row.article.title}
                        </Link>
                        <p className="mt-1 line-clamp-1 text-xs text-slate-500">{row.article.author?.fullName || row.article.author?.username}</p>
                        {row.article.readingTime ? (
                          <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-400">
                            <Clock3 className="h-3.5 w-3.5" />
                            {row.article.readingTime} {t('articles.minRead')}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => void removeSaved(row.article._id)}
                        disabled={busy === `bookmark:${row.article._id}`}
                        aria-label={`${t('library.remove')}: ${row.article.title}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:border-red-300 hover:text-red-700 disabled:opacity-60"
                      >
                        {busy === `bookmark:${row.article._id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                        {t('library.remove')}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
                  {t('library.savedEmpty')}
                </p>
              )}
              {savedGone > 0 && (
                <p className="mt-2 text-xs text-slate-500">
                  {savedGone === 1 ? `${savedGone} ${t('library.goneOne')}` : `${savedGone} ${t('library.goneMany')}`}
                </p>
              )}
            </section>

            <section>
              <div className="mb-3 flex items-baseline justify-between border-b border-slate-200 pb-2">
                <h2 className="text-lg font-extrabold">{t('library.following')}</h2>
                <span className="text-sm text-slate-500">
                  {followedCount === 1 ? `${followedCount} ${t('library.followingOne')}` : `${followedCount} ${t('library.followingMany')}`}
                </span>
              </div>
              {follows.length ? (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {follows.map((row) => (
                    <li key={row._id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
                      <Link to={`/user/${row.writer.user._id}`} aria-label={row.writer.user.fullName || ''}>
                        <Avatar
                          src={row.writer.user.avatar}
                          name={row.writer.user.fullName}
                          className="h-10 w-10 bg-blue-100"
                          textClassName="font-bold text-blue-700"
                        />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link to={`/user/${row.writer.user._id}`} className="block truncate text-sm font-bold text-slate-900 hover:text-blue-800">
                          {row.writer.user.fullName}
                        </Link>
                        <p className="truncate text-xs text-slate-500">@{row.writer.user.username}</p>
                        {(row.writer.bio || row.writer.user.bio) && (
                          <p className="mt-1 line-clamp-2 text-xs text-slate-500">{row.writer.bio || row.writer.user.bio}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void unfollow(row)}
                        disabled={busy === `follow:${row.writer.user._id}`}
                        aria-label={`${t('library.unfollow')}: ${row.writer.user.fullName}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:border-red-300 hover:text-red-700 disabled:opacity-60"
                      >
                        {busy === `follow:${row.writer.user._id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                        {t('library.unfollow')}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
                  {t('library.followingEmpty')}
                </p>
              )}
              {followsGone > 0 && (
                <p className="mt-2 text-xs text-slate-500">
                  {followsGone === 1 ? `${followsGone} ${t('library.writerGoneOne')}` : `${followsGone} ${t('library.writerGoneMany')}`}
                </p>
              )}
            </section>

            <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm">
              <span className="font-semibold text-slate-700">{t('library.tip')}</span>{' '}
              <Link to="/articles" className="font-bold text-blue-700 hover:underline">{t('home.browse')}</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
