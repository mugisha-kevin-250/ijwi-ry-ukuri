import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, RefreshCw, Search, Trash2, FileText } from 'lucide-react'
import { adminAPI } from '../../services/api'
import type { PagedResult } from '../../services/api'
import type { Article } from '../../types'

const LIMIT = 25
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'published', label: 'Published' },
  { value: 'pending_review', label: 'Pending review' },
  { value: 'approved', label: 'Approved' },
  { value: 'draft', label: 'Draft' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'archived', label: 'Archived' },
]
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'views', label: 'Most viewed' },
  { value: 'latest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
]

function statusBadge(status: string): string {
  switch (status) {
    case 'published': return 'bg-emerald-50 text-emerald-700'
    case 'approved': return 'bg-blue-50 text-blue-700'
    case 'pending_review': return 'bg-amber-50 text-amber-700'
    case 'rejected': return 'bg-red-50 text-red-700'
    case 'archived': return 'bg-slate-200 text-slate-600'
    default: return 'bg-slate-100 text-slate-600'
  }
}

function authorName(author: Article['author']): string {
  if (author && typeof author === 'object') return author.fullName || author.username || 'Unknown'
  return 'Unknown'
}

function categoryName(category: Article['category']): string {
  if (category && typeof category === 'object') return category.name
  if (typeof category === 'string') return category
  return 'Uncategorised'
}

export default function AdminArticlesPage() {
  const [data, setData] = useState<PagedResult<Article> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const [page, setPage] = useState(1)
  const [sort, setSort] = useState('views')
  const [status, setStatus] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    setPage(1)
  }, [sort, status])

  const loadArticles = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await adminAPI.getArticles({
        page,
        limit: LIMIT,
        sort,
        status: status || undefined,
        search: search || undefined,
      })
      setData(result)
    } catch (err: any) {
      setError(err?.response?.data?.message || 'We could not load stories. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [page, sort, status, search])

  useEffect(() => {
    void loadArticles()
  }, [loadArticles])

  const changeStatus = async (id: string, next: string) => {
    setBusyId(id)
    setActionError('')
    try {
      await adminAPI.updateArticleStatus(id, next)
      await loadArticles()
    } catch (err: any) {
      setActionError(err?.response?.data?.message || 'That status change could not be saved.')
    } finally {
      setBusyId(null)
    }
  }

  const removeArticle = async (id: string) => {
    if (!window.confirm('Delete this story permanently?')) return
    setBusyId(id)
    setActionError('')
    try {
      await adminAPI.deleteArticle(id)
      await loadArticles()
    } catch (err: any) {
      setActionError(err?.response?.data?.message || 'That story could not be deleted.')
    } finally {
      setBusyId(null)
    }
  }

  const total = data?.total ?? 0
  const pages = data?.pages ?? 1
  const articles = data?.items ?? []

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-blue-700">Newsroom</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">Top news by views</h1>
          <p className="mt-1 text-sm text-slate-500">Every story on the platform, ranked by reach. Moderate status or remove content.</p>
        </div>
        <button type="button" onClick={() => void loadArticles()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search stories by title"
              className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400" aria-label="Sort stories">
              {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400" aria-label="Filter by status">
              {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{error}</span>
          <button type="button" onClick={() => void loadArticles()} className="font-bold underline">Retry</button>
        </div>
      )}
      {actionError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError('')} className="font-bold underline">Dismiss</button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="space-y-3 p-5">{[1, 2, 3, 4, 5].map((item) => <div key={item} className="h-14 animate-pulse rounded-lg bg-slate-100" />)}</div>
        ) : articles.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <FileText className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">No stories match your filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">#</th>
                  <th className="px-4 py-3 font-semibold">Story</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Views</th>
                  <th className="px-4 py-3 font-semibold">Likes</th>
                  <th className="px-4 py-3 font-semibold">Published</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {articles.map((article, index) => (
                  <tr key={article._id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3.5 font-bold text-slate-400">{(page - 1) * LIMIT + index + 1}</td>
                    <td className="max-w-[320px] px-4 py-3.5">
                      <a href={`/article/${article.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 line-clamp-2 font-semibold text-slate-800 hover:text-blue-800">
                        {article.title}<ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      </a>
                      <p className="mt-1 text-xs text-slate-400">{authorName(article.author)}</p>
                    </td>
                    <td className="px-4 py-3.5"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{categoryName(article.category)}</span></td>
                    <td className="px-4 py-3.5"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${statusBadge(article.status)}`}>{String(article.status).replace('_', ' ')}</span></td>
                    <td className="px-4 py-3.5 font-semibold text-slate-700">{(article.views || 0).toLocaleString()}</td>
                    <td className="px-4 py-3.5 text-slate-700">{(article.likes || 0).toLocaleString()}</td>
                    <td className="px-4 py-3.5 text-xs text-slate-500">{article.publishedAt ? new Date(article.publishedAt).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={article.status}
                          disabled={busyId === article._id}
                          onChange={(e) => void changeStatus(article._id, e.target.value)}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400"
                        >
                          {STATUS_OPTIONS.filter((option) => option.value).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                        <button
                          type="button"
                          disabled={busyId === article._id}
                          onClick={() => void removeArticle(article._id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                        >
                          {busyId === article._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <p className="font-medium">{total.toLocaleString()} stories total</p>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50">
              <ChevronLeft className="h-4 w-4" />Prev
            </button>
            <span className="font-semibold">Page {page} of {pages}</span>
            <button type="button" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50">
              Next<ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
