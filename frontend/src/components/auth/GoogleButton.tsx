import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? ''
// hl=en keeps Google's own labels in English; the app's language changes with
// it, but the sign-in button must stay readable for every reader.
const GIS_SRC = 'https://accounts.google.com/gsi/client?hl=en'

interface GoogleIdApi {
  initialize: (options: Record<string, unknown>) => void
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void
}

function googleIdApi(): GoogleIdApi | undefined {
  const holder = window as unknown as { google?: { accounts?: { id?: GoogleIdApi } } }
  return holder.google?.accounts?.id
}

let loader: Promise<GoogleIdApi> | null = null

function loadGoogleIdApi(): Promise<GoogleIdApi> {
  const already = googleIdApi()
  if (already) return Promise.resolve(already)
  if (loader) return loader

  loader = new Promise<GoogleIdApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`)
    const script = existing ?? Object.assign(document.createElement('script'), { src: GIS_SRC, async: true })
    const fail = () => {
      loader = null
      reject(new Error('Google could not be reached. Please try again.'))
    }
    script.addEventListener('load', () => {
      const api = googleIdApi()
      if (api) resolve(api)
      else fail()
    })
    script.addEventListener('error', fail)
    if (!existing) document.head.appendChild(script)
  })
  return loader
}

interface GoogleButtonProps {
  flow: 'signin' | 'signup'
  onSuccess: () => void
  onError: (message: string) => void
}

export default function GoogleButton({ flow, onSuccess, onError }: GoogleButtonProps) {
  const { signInWithGoogle } = useAuth()
  const containerRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  // Google keeps the callback it was initialized with, so the handlers are read
  // through a ref instead of closing over the first render's versions.
  const handlers = useRef({ onSuccess, onError, signInWithGoogle })
  handlers.current = { onSuccess, onError, signInWithGoogle }

  useEffect(() => {
    if (!CLIENT_ID) return
    let stopped = false

    loadGoogleIdApi()
      .then((api) => {
        if (stopped) return
        api.initialize({
          client_id: CLIENT_ID,
          auto_select: false,
          callback: (response: { credential?: string }) => {
            if (!response?.credential) {
              handlers.current.onError('Google did not return an account.')
              return
            }
            handlers.current
              .signInWithGoogle(response.credential)
              .then(() => handlers.current.onSuccess())
              .catch((error: unknown) => {
                handlers.current.onError(error instanceof Error ? error.message : 'Google sign-in failed.')
              })
          },
        })

        const container = containerRef.current
        if (!container) return
        // React StrictMode mounts effects twice and Google appends into this
        // node, so it is emptied before every render.
        container.replaceChildren()
        api.renderButton(container, {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: flow === 'signup' ? 'signup_with' : 'signin_with',
          // Without this Google labels the button in the browser's own language,
          // which lands as French for most of our readers.
          locale: 'en',
          width: 288,
        })
        setState('ready')
      })
      .catch((error: unknown) => {
        if (stopped) return
        setState('failed')
        onError(error instanceof Error ? error.message : 'Google sign-in failed.')
      })

    return () => {
      stopped = true
    }
  }, [flow, onError])

  if (!CLIENT_ID) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">or</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>
      <div className="relative min-h-[44px]">
        <div ref={containerRef} className="notranslate flex justify-center" translate="no" />
        {state === 'loading' && (
          <div
            className="absolute inset-0 animate-pulse rounded-lg bg-slate-100"
            role="status"
            aria-label="Google sign-in"
          />
        )}
      </div>
    </div>
  )
}
