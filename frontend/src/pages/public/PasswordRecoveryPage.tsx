import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, KeyRound, Mail, ShieldQuestion } from 'lucide-react'
import { authAPI } from '../../services/api'
import { useI18n } from '../../context/I18nContext'

/**
 * Getting back in, in two steps on one screen: the address, then the code that
 * was mailed to it together with the new password.
 *
 * The wording follows what the server can actually promise. It never says"we
 * have sent you a code" - it says that if the address has an account, a code is
 * on its way, because that is true whether or not it does. And the code and the
 * new password arrive in one request, so nobody can prove they own a mailbox and
 * then be handed a session with the account in it.
 */
type Step = 'email' | 'code' | 'done'

export default function PasswordRecoveryPage() {
  const { t } = useI18n()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  // A minute between codes is the server's rule, so the button counts it down
  // rather than letting a reader press it and be told no twice.
  const [waitSeconds, setWaitSeconds] = useState(0)

  useEffect(() => {
    if (waitSeconds <= 0) return
    const tick = setTimeout(() => setWaitSeconds((s) => s - 1), 1000)
    return () => clearTimeout(tick)
  }, [waitSeconds])

  const askForCode = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await authAPI.sendRecoveryCode(email.trim())
      const payload = response.data.data as { sent?: boolean; cooling?: boolean } | undefined
      setStep('code')
      setNotice(response.data.message)
      if (payload?.cooling) setWaitSeconds(60)
    } catch (err: any) {
      // 503 means this server cannot send mail at all. Saying so is the whole
      // point: a reader who is promised a code that cannot arrive just waits.
      setError(err?.response?.data?.message || t('auth.recovery.sendFailed'))
    } finally {
      setBusy(false)
    }
  }

  const finish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (password !== confirm) {
      setError(t('auth.recovery.passwordsDiffer'))
      return
    }
    setBusy(true)
    try {
      const response = await authAPI.resetPassword({ email: email.trim(), code: code.trim(), password })
      setNotice(response.data.message || t('auth.recovery.done'))
      setStep('done')
    } catch (err: any) {
      setError(err?.response?.data?.message || t('auth.recovery.resetFailed'))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-2xl items-center justify-center px-4 py-12">
      <div className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-10">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-lg bg-blue-50 p-2 text-blue-700">
            {step === 'done' ? <KeyRound className="h-5 w-5" /> : <ShieldQuestion className="h-5 w-5" />}
          </span>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">{t('auth.recovery.title')}</h1>
            <p className="mt-1 text-sm text-slate-500">{t('auth.recovery.subtitle')}</p>
          </div>
        </div>

        {notice && (
          <p className="mt-5 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">{notice}</p>
        )}
        {error && (
          <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
        )}

        {step === 'email' && (
          <form onSubmit={askForCode} className="mt-6 space-y-4">
            <label className="block text-sm font-semibold text-slate-700">
              {t('auth.recovery.emailLabel')}
              <span className="relative mt-1.5 block">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  placeholder={t('auth.recovery.emailPlaceholder')}
                  className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </span>
            </label>
            <p className="text-xs text-slate-500">{t('auth.recovery.emailHint')}</p>
            <button
              type="submit"
              disabled={busy || waitSeconds > 0}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? t('auth.recovery.sending') : t('auth.recovery.send')}
              {!busy && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={finish} className="mt-6 space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {t('auth.recovery.sentTo')} <span className="font-semibold text-slate-800">{email.trim()}</span>
            </div>

            <label className="block text-sm font-semibold text-slate-700">
              {t('auth.recovery.codeLabel')}
              <input
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                placeholder={t('auth.recovery.codePlaceholder')}
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-center text-lg font-bold tracking-[0.4em] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <span className="mt-1 block text-xs font-normal text-slate-500">{t('auth.recovery.codeHint')}</span>
            </label>

            <label className="block text-sm font-semibold text-slate-700">
              {t('auth.recovery.newPassword')}
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <span className="mt-1 block text-xs font-normal text-slate-500">{t('auth.recovery.passwordHint')}</span>
            </label>

            <label className="block text-sm font-semibold text-slate-700">
              {t('auth.recovery.confirmPassword')}
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? t('auth.recovery.checking') : t('auth.recovery.finish')}
              {!busy && <ArrowRight className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={() => void askForCode()}
              disabled={busy || waitSeconds > 0}
              className="w-full text-center text-xs font-semibold text-blue-700 hover:underline disabled:text-slate-400 disabled:no-underline"
            >
              {waitSeconds > 0 ? `${t('auth.recovery.waitA')} ${waitSeconds}s` : t('auth.recovery.anotherCode')}
            </button>
          </form>
        )}

        {step === 'done' && (
          <div className="mt-6 space-y-4">
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {t('auth.recovery.done')}
            </p>
            <Link
              to="/login"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-800"
            >
              {t('auth.recovery.signInNow')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        <p className="mt-6 text-center text-sm text-slate-500">
          {t('auth.recovery.backTo')}{' '}
          <Link to="/login" className="font-bold text-blue-700 hover:text-blue-900">{t('auth.recovery.backLink')}</Link>
        </p>
      </div>
    </main>
  )
}
