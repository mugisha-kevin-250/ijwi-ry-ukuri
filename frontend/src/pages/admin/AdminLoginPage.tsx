import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, Lock, ShieldCheck, User } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

export default function AdminLoginPage() {
  const { adminLogin, user, loading } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (!loading && user?.role === 'ADMIN') {
    return <Navigate to="/mugishaimekevin/dashboard" replace />
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await adminLogin(username.trim(), password)
      navigate('/mugishaimekevin/dashboard', { replace: true })
    } catch (err: any) {
      setError(err?.message || 'Admin login failed. Please check your credentials.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
          <div className="flex flex-col items-center text-center">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-900/40">
              <ShieldCheck className="h-7 w-7 text-white" />
            </span>
            <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-white">Admin Portal</h1>
            <p className="mt-1 text-sm text-slate-400">Restricted area. Authorised administrators only.</p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="admin-username" className="mb-1.5 block text-sm font-semibold text-slate-200">Username</label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  id="admin-username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="kevin"
                  className="w-full rounded-lg border border-white/10 bg-slate-900/60 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
            </div>

            <div>
              <label htmlFor="admin-password" className="mb-1.5 block text-sm font-semibold text-slate-200">Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  id="admin-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-white/10 bg-slate-900/60 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
            </div>

            {error && (
              <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-sm font-medium text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !username.trim() || !password}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-900/30 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {submitting ? 'Signing in…' : 'Sign in to admin'}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-slate-500">
            Seed administrator username is <span className="font-semibold text-slate-300">kevin</span>.
          </p>
        </div>

        <div className="mt-6 text-center">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-300 transition hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Back to site
          </Link>
        </div>
      </div>
    </div>
  )
}
