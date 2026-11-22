import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldAlert, Trash2 } from 'lucide-react'
import { toast } from 'react-toastify'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../context/I18nContext'
import { userAPI } from '../../services/api'

/**
 * The reader's own deletion button.
 *
 * The privacy page has said for a long time that a reader can ask for their
 * account and their personal data to be removed, and until now the only way to
 * do that was to write to the newsroom and wait. This is the same request, made
 * by the person it concerns, proved by the password on the account.
 *
 * The card says plainly what is erased - comments, likes, bookmarks, follows,
 * the inbox, stored devices, reading history, the alert address and any contact
 * mail from that address - and what is kept: published stories and their
 * bylines, and the newsroom's payment record. That second list is the reason
 * the server sometimes refuses this press, and the refusal is printed in the
 * server's own words instead of being guessed at here.
 */
export default function CloseAccountCard() {
  const { t } = useI18n()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const close = async () => {
    setBusy(true)
    setError('')
    try {
      const response = await userAPI.closeAccount(password)
      const message = response.data?.message || t('account.closed')
      // The session token is useless the moment the account row is gone, and
      // leaving it in storage would only make the next page error.
      logout()
      setPassword('')
      setAgreed(false)
      setOpen(false)
      toast.success(message)
      navigate('/', { replace: true })
    } catch (err: any) {
      setError(err?.response?.data?.message || t('account.closeFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-red-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-700">
          <ShieldAlert className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-slate-900">{t('account.closeTitle')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('account.closeDesc')}</p>
          <p className="mt-2 text-xs text-slate-500">{t('account.closeKept')}</p>

          {!open && (
            <button
              type="button"
              onClick={() => { setError(''); setOpen(true) }}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {t('account.closeButton')}
            </button>
          )}

          {open && (
            <div className="mt-4 rounded-lg border border-red-100 bg-red-50/60 p-4">
              <p className="text-sm font-bold text-slate-900">
                {t('account.confirmTitle')}
                <span translate="no" className="ml-2 font-mono text-xs font-normal text-slate-500">{user?.email || ''}</span>
              </p>

              <label className="mt-3 block">
                <span className="text-xs font-bold text-slate-700">{t('account.passwordLabel')}</span>
                <input
                  type="password"
                  value={password}
                  autoComplete="current-password"
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-1 w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-red-400 focus:outline-none"
                />
              </label>

              <label className="mt-3 flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(event) => setAgreed(event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-red-700 focus:ring-red-200"
                />
                <span className="text-xs text-slate-700">{t('account.confirmCheck')}</span>
              </label>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void close()}
                  disabled={busy || !agreed || password.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-800 disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  {busy ? t('account.closing') : t('account.closeConfirm')}
                </button>
                <button
                  type="button"
                  onClick={() => { setOpen(false); setError(''); setPassword(''); setAgreed(false) }}
                  disabled={busy}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  {t('account.closeCancel')}
                </button>
              </div>

              {error && (
                <p role="alert" className="mt-3 text-xs font-semibold text-red-700">{error}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
