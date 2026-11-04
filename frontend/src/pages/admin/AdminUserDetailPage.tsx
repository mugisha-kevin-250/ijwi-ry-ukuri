import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, ExternalLink, FileText, Heart, Loader2, Mail, Eye, BookOpen } from 'lucide-react'
import { adminAPI } from '../../services/api'
import type { User } from '../../types'

interface UserStats {
  views?: number
  likes?: number
  published?: number
  pending?: number
}

function roleBadge(role: User['role']): string {
  switch (role) {
    case 'ADMIN': return 'bg-red-50 text-red-700'
    case 'EDITOR': return 'bg-violet-50 text-violet-700'
    case 'WRITER': return 'bg-blue-50 text-blue-700'
    default: return 'bg-slate-100 text-slate-600'
  }
}

function statusBadge(status: string): string {
  switch (status) {
    case 'published': return 'bg-emerald-50 text-emerald-700'
    case 'approved': return 'bg-blue-50 text-blue-700'
    case 'pending_review': return 'bg-amber-50 text-amber-700'
    case 'rejected': return 'bg-red-50 text-red-700'
    default: return 'bg-slate-100 text-slate-600'
  }
}

function initials(name: string): string {
  return name.split(' ').map((part) => part.charAt(0)).join('').slice(0, 2).toUpperCase()
}

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [user, setUser] = useState<User | null>(null)
  const [articles, setArticles] = useState<any[]>([])
  const [stats, setStats] = useState<UserStats>({})
  const [totalArticles, setTotalArticles] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)

  const loadUser = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError('')
    try {
      const response = await adminAPI.getUser(id)
      const payload = response.data.data as any
      setUser((payload?.user as User) ?? null)
      setArticles(Array.isArray(payload?.articles) ? payload.articles : [])
      setStats(payload?.stats ?? {})
      setTotalArticles(payload?.totalArticles ?? (Array.isArray(payload?.articles) ? payload.articles.length : 0))
    } catch (err: any) {
      setError(err?.response?.data?.message || 'We could not load this user. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void loadUser()
  }, [loadUser])

  const applyChange = async (changes: { role?: string; isActive?: boolean }, warning?: string) => {
    if (!id) return
    if (warning && !window.confirm(warning)) return
    setBusy(true)
    setActionError('')
    try {
      await adminAPI.updateUser(id, changes)
      await loadUser()
    } catch (err: any) {
      setActionError(err?.response?.data?.message || 'That change could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="h-32 animate-pulse rounded-xl bg-slate-200" />
        <div className="grid gap-4 sm:grid-cols-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-200" />)}</div>
        <div className="h-40 animate-pulse rounded-xl bg-slate-200" />
      </div>
    )
  }

  if (error || !user) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <Link to="/mugishaimekevin/users" className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-700 hover:text-blue-900"><ArrowLeft className="h-4 w-4" />All users</Link>
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{error || 'This user could not be found.'}</span>
          <button type="button" onClick={() => void loadUser()} className="font-bold underline">Retry</button>
        </div>
      </div>
    )
  }

  const tiles = [
    { label: 'Stories', value: totalArticles, icon: FileText, tone: 'bg-blue-50 text-blue-700' },
    { label: 'Published', value: stats.published ?? 0, icon: BookOpen, tone: 'bg-emerald-50 text-emerald-700' },
    { label: 'Total views', value: stats.views ?? 0, icon: Eye, tone: 'bg-violet-50 text-violet-700' },
    { label: 'Likes', value: stats.likes ?? 0, icon: Heart, tone: 'bg-rose-50 text-rose-700' },
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link to="/mugishaimekevin/users" className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-700 hover:text-blue-900"><ArrowLeft className="h-4 w-4" />All users</Link>

      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-4">
          {user.avatar ? (
            <img src={user.avatar} alt="" className="h-16 w-16 rounded-full object-cover" />
          ) : (
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-lg font-extrabold text-white">{initials(user.fullName || user.username)}</span>
          )}
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">{user.fullName}</h1>
            <p className="text-sm text-slate-500">@{user.username}</p>
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-slate-500"><Mail className="h-3.5 w-3.5" />{user.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${roleBadge(user.role)}`}>{user.role}</span>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${user.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{user.isActive ? 'Active' : 'Inactive'}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600"><CalendarDays className="h-3 w-3" />Joined {new Date(user.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={user.role}
            disabled={busy}
            onChange={(e) => void applyChange({ role: e.target.value }, e.target.value === user.role ? undefined : `Change ${user.fullName}'s role to ${e.target.value}?`)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400"
          >
            <option value="READER">Reader</option>
            <option value="WRITER">Writer</option>
            <option value="EDITOR">Editor</option>
            <option value="ADMIN">Admin</option>
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={() => void applyChange(
              { isActive: !user.isActive },
              user.isActive ? `Deactivate ${user.fullName}? They will lose access until reactivated.` : undefined,
            )}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition disabled:opacity-60 ${user.isActive ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {user.isActive ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>

      {actionError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError('')} className="font-bold underline">Dismiss</button>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="User statistics">
        {tiles.map((tile) => {
          const Icon = tile.icon
          return (
            <div key={tile.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500">{tile.label}</p>
                <span className={`rounded-lg p-2 ${tile.tone}`}><Icon className="h-4 w-4" /></span>
              </div>
              <p className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">{(tile.value || 0).toLocaleString()}</p>
            </div>
          )
        })}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-bold text-slate-900">Stories by {user.fullName?.split(' ')[0] || 'this user'}</h2>
          <p className="mt-1 text-xs text-slate-500">{totalArticles.toLocaleString()} {totalArticles === 1 ? 'submission' : 'submissions'}</p>
        </div>
        {articles.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <FileText className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">This user has not written any stories yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {articles.map((article: any) => {
              const category = typeof article.category === 'string' ? article.category : article.category?.name
              return (
                <div key={article._id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <a href={`/article/${article.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 line-clamp-1 text-sm font-semibold text-slate-800 hover:text-blue-800">
                      {article.title}<ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                    </a>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      {category && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{category}</span>}
                      <span>{new Date(article.publishedAt || article.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Eye className="h-3.5 w-3.5" />{(article.views || 0).toLocaleString()}</span>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${statusBadge(article.status)}`}>{String(article.status || '').replace('_', ' ')}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
