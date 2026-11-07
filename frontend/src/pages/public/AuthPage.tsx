import { useCallback, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, LockKeyhole, Mail, UserRound } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import GoogleButton from '../../components/auth/GoogleButton'

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const isRegister = mode === 'register'

  const goToHome = useCallback(() => {
    const currentUser = JSON.parse(localStorage.getItem('user') || 'null') as { role?: string } | null
    const roleHome = currentUser?.role === 'ADMIN' ? '/mugishaimekevin/dashboard' : currentUser?.role === 'WRITER' ? '/writer/dashboard' : '/'
    // A visitor sent here by the sign-in prompt goes back to the story they were reading.
    const publicFrom = from && !/^\/(login|register|mugishaimekevin|writer)/.test(from)
    navigate(publicFrom ? from : roleHome, { replace: true })
  }, [from, navigate])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      if (isRegister) {
        await register({ fullName: fullName.trim(), username: username.trim(), email: email.trim(), password })
      } else {
        await login(email.trim(), password)
      }
      goToHome()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'We could not complete your request. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-6xl items-center justify-center px-4 py-12">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl md:grid-cols-[0.9fr_1.1fr]">
        <aside className="hidden flex-col justify-between bg-gradient-to-br from-[#062b52] to-blue-700 p-9 text-white md:flex">
          <Link to="/" className="text-xl font-black tracking-tight">Rwanda<span className="text-cyan-300">Now</span></Link>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">Stay informed</p>
            <h1 className="mt-3 text-3xl font-extrabold leading-tight">The stories shaping Rwanda, all in one place.</h1>
            <p className="mt-4 text-sm leading-relaxed text-blue-100">Read trusted reporting and share your perspective with a growing community of writers and readers.</p>
          </div>
          <p className="text-xs text-blue-200">Real news. Real people. A better Rwanda.</p>
        </aside>
        <section className="p-6 sm:p-10">
          <Link to="/" className="text-sm font-bold text-blue-700 md:hidden">Ijwi ry'ukuri</Link>
          <p className="mt-5 text-sm font-semibold text-blue-700">{isRegister ? 'Fungura konti yawe' : 'Murakaza neza'}</p>
          <h2 className="mt-1 text-2xl font-extrabold text-slate-900">{isRegister ? "Iyandikishe kuri Ijwi ry'ukuri" : "Injira kuri Ijwi ry'ukuri"}</h2>
          <p className="mt-2 text-sm text-slate-500">{isRegister ? "Tangira nk'umusomyi uhuze n'inkuru zo mu karere." : "Komeza gusoma no gucunga inkuru zawe."}</p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            {isRegister && (
              <>
                <label className="block text-sm font-semibold text-slate-700">Full name
                  <span className="relative mt-1.5 block"><UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input required value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></span>
                </label>
                <label className="block text-sm font-semibold text-slate-700">Username
                  <input required minLength={3} value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                </label>
              </>
            )}
            <label className="block text-sm font-semibold text-slate-700">Email address
              <span className="relative mt-1.5 block"><Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></span>
            </label>
            <label className="block text-sm font-semibold text-slate-700">Password
              <span className="relative mt-1.5 block"><LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="password" required minLength={isRegister ? 8 : undefined} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isRegister ? 'new-password' : 'current-password'} className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></span>
              {isRegister && <span className="mt-1 block text-xs font-normal text-slate-500">Use at least 8 characters.</span>}
            </label>
            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
            <button type="submit" disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}{!submitting && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>
          <div className="mt-6">
            <GoogleButton flow={isRegister ? 'signup' : 'signin'} onSuccess={goToHome} onError={setError} />
          </div>
          <p className="mt-6 text-center text-sm text-slate-500">
            {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
            <Link to={isRegister ? '/login' : '/register'} className="font-bold text-blue-700 hover:text-blue-900">{isRegister ? 'Sign in' : 'Create one'}</Link>
          </p>
        </section>
      </div>
    </main>
  )
}
