import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, RefreshCw, Search, Users as UsersIcon } from 'lucide-react'
import { adminAPI } from '../../services/api'
import type { AdminUserRecord, PagedResult } from '../../services/api'

const ROLES = ['ALL', 'READER', 'WRITER', 'EDITOR', 'ADMIN'] as const
const LIMIT = 20

function roleBadge(role: AdminUserRecord['role']): string {
  switch (role) {
    case 'ADMIN': return 'bg-red-50 text-red-700'
    case 'EDITOR': return 'bg-violet-50 text-violet-700'
    case 'WRITER': return 'bg-blue-50 text-blue-700'
    default: return 'bg-slate-100 text-slate-600'
  }
}

export default function AdminUsersPage() {
  const [data, setData] = useState<PagedResult<AdminUserRecord> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const [page, setPage] = useState(1)
  const [role, setRole] = useState<(typeof ROLES)[number]>('ALL')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')

  // Debounce the free-text search so typing does not spam the API.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    setPage(1)
  }, [role])

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await adminAPI.getUsers({
        page,
        limit: LIMIT,
        role: role === 'ALL' ? undefined : role,
        search: search || undefined,
      })
      setData(result)
    } catch (err: any) {
      setError(err?.response?.data?.message || 'We could not load users. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [page, role, search])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  const applyChange = async (id: string, changes: { role?: string; isActive?: boolean }, warning?: string) => {
    if (warning && !window.confirm(warning)) return
    setBusyId(id)
    setActionError('')
    try {
      await adminAPI.updateUser(id, changes)
      await loadUsers()
    } catch (err: any) {
      setActionError(err?.response?.data?.message || 'That change could not be saved.')
    } finally {
      setBusyId(null)
    }
  }

  const total = data?.total ?? 0
  const pages = data?.pages ?? 1
  const users = data?.items ?? []

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-blue-700">People</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">Users</h1>
          <p className="mt-1 text-sm text-slate-500">Every account on RwandaNow, their role and story activity.</p>
        </div>
        <button type="button" onClick={() => void loadUsers()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name, username or email"
              className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ROLES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setRole(option)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${role === option ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {option === 'ALL' ? 'All' : option.charAt(0) + option.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{error}</span>
          <button type="button" onClick={() => void loadUsers()} className="font-bold underline">Retry</button>
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
          <div className="space-y-3 p-5">
            {[1, 2, 3, 4, 5].map((item) => <div key={item} className="h-14 animate-pulse rounded-lg bg-slate-100" />)}
          </div>
        ) : users.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <UsersIcon className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">No users match your filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">User</th>
                  <th className="px-5 py-3 font-semibold">Role</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Stories</th>
                  <th className="px-5 py-3 font-semibold">Views</th>
                  <th className="px-5 py-3 font-semibold">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u._id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-900">{u.fullName}</div>
                      <div className="text-xs text-slate-400">@{u.username}</div>
                      <div className="mt-0.5 text-xs text-slate-400">{u.email}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${roleBadge(u.role)}`}>{u.role}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${u.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-700">{u.articleCount ?? 0}</td>
                    <td className="px-5 py-3.5 text-slate-700">{(u.totalViews ?? 0).toLocaleString()}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/mugishaimekevin/users/${u._id}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-50">
                          View stories <ExternalLink className="h-3 w-3" />
                        </Link>
                        <select
                          value={u.role}
                          disabled={busyId === u._id}
                          onChange={(e) => void applyChange(u._id, { role: e.target.value }, e.target.value === u.role ? undefined : `Change ${u.fullName}'s role to ${e.target.value}?`)}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400"
                        >
                          <option value="READER">Reader</option>
                          <option value="WRITER">Writer</option>
                          <option value="EDITOR">Editor</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                        <button
                          type="button"
                          disabled={busyId === u._id}
                          onClick={() => void applyChange(
                            u._id,
                            { isActive: !u.isActive },
                            u.isActive ? `Deactivate ${u.fullName}? They will lose access until reactivated.` : undefined,
                          )}
                          className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition disabled:opacity-60 ${u.isActive ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                        >
                          {busyId === u._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (u.isActive ? 'Deactivate' : 'Activate')}
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
          <p className="font-medium">{total.toLocaleString()} users total</p>
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
