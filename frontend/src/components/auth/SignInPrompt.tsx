import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Heart, X } from 'lucide-react'
import { useI18n } from '../../context/I18nContext'
import { dismissSignIn, isSignInOpen, subscribeSignIn } from '../../utils/signInPrompt'

export default function SignInPrompt() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const [open, setOpen] = useState(isSignInOpen())

  useEffect(() => subscribeSignIn(setOpen), [])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismissSignIn()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  if (!open) return null

  const from = `${window.location.pathname}${window.location.search}`
  const goTo = (path: string) => {
    dismissSignIn()
    navigate(path, { state: { from } })
  }

  return (
    <div
      translate="no"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-blue-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sign-in-prompt-title"
      onClick={dismissSignIn}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-blue-100"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="bg-gradient-to-br from-blue-800 to-blue-600 px-6 py-7 text-center text-white">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/30">
            <Heart className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 id="sign-in-prompt-title" className="mt-4 text-xl font-extrabold tracking-tight">
            {t('signin.title')}
          </h2>
        </div>
        <div className="px-6 pb-6 pt-5">
          <p className="text-sm leading-relaxed text-slate-600">{t('signin.body')}</p>
          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={() => goTo('/register')}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-800"
            >
              {t('signin.register')}
            </button>
            <button
              type="button"
              onClick={() => goTo('/login')}
              className="w-full rounded-lg border-2 border-blue-600 bg-white px-4 py-3 text-sm font-bold text-blue-700 transition hover:bg-blue-50"
            >
              {t('signin.login')}
            </button>
          </div>
          <button
            type="button"
            onClick={dismissSignIn}
            className="mx-auto mt-4 flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-blue-700"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            {t('signin.dismiss')}
          </button>
        </div>
      </div>
    </div>
  )
}
