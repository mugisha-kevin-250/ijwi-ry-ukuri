import { Component, type ReactNode } from 'react'
import { WifiOff } from 'lucide-react'
import { isOffline, onConnectionChange } from '../../utils/connection'
import { errorLooksOffline } from '../../utils/crashMessages'
import { useI18n } from '../../context/I18nContext'

/**
 * The screen a reader gets when something on the page could not be shown.
 *
 * Until now the site had no boundary anywhere, so one component that trusted
 * missing data took the whole tree down with it and the reader was left staring
 * at React's own wall of text - the"react error massage" the newsroom
 * complained about. Most of those were not really crashes: a request that dies
 * in the wire has no body, the page receives nothing, the story it tried to
 * open was never downloaded, and the honest sentence is simply"your connection
 * is down". So this card leads with the connection when the connection is what
 * is down, and with a plain"we could not open this" when it is not. The
 * technical text is never shown: it goes to the console, where a developer can
 * read it, because it means nothing to a reader and can carry addresses and ids
 * that are not the reader's business.
 */

export type CrashCopy = {
  title: string
  body: string
  offlineBody: string
  retry: string
  home: string
}

/** The words on the card, in the language the reader chose. */
export function useCrashCopy(): CrashCopy {
  const { t } = useI18n()
  return {
    title: t('crash.title'),
    body: t('crash.body'),
    offlineBody: t('crash.offlineBody'),
    retry: t('crash.retry'),
    home: t('crash.home'),
  }
}

export function CrashCard({
  copy,
  offline,
  onRetry,
}: {
  copy: CrashCopy
  offline: boolean
  onRetry: () => void
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div
        role="alert"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm"
      >
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
          <WifiOff className="h-6 w-6 text-amber-700" />
        </span>
        <h2 className="text-lg font-bold text-slate-900">{copy.title}</h2>
        {/* A dead radio is the one cause we can name with confidence, and the
            only one worth putting in front of a reader. */}
        <p className="mt-2 text-sm text-slate-600">{offline ? copy.offlineBody : copy.body}</p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="rounded-full bg-blue-700 px-5 py-2 text-sm font-bold text-white hover:bg-blue-800"
          >
            {copy.retry}
          </button>
          {/* Straight to the home page through the browser rather than the
              router: the tree that owns the router may be the thing that just
              fell over. */}
          <button
            type="button"
            onClick={() => window.location.assign('/')}
            className="rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {copy.home}
          </button>
        </div>
      </div>
    </div>
  )
}

type BoundaryProps = {
  children: ReactNode
  copy: CrashCopy
  /**
   * Whether"try again" rebuilds this part of the page (a boundary inside the
   * app, which can re-mount its children) or reloads the document (a route
   * error, where the thing that failed may be a script we never managed to
   * download, and only a fresh load can ask for it again).
   */
  mode?: 'reset' | 'reload'
}

type BoundaryState = { failed: boolean; offline: boolean; reloadOnRetry: boolean }

class CrashBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false, offline: isOffline(), reloadOnRetry: false }

  private unsubscribe?: () => void

  componentDidMount() {
    this.unsubscribe = onConnectionChange((offline) => this.setState({ offline }))
  }

  componentWillUnmount() {
    this.unsubscribe?.()
  }

  static getDerivedStateFromError(): Partial<BoundaryState> {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('[radar] unhandled render error', error)
    // A page whose file never arrived reads as a crash to React, but there is
    // nothing in the tree for"try again" to rebuild: the code itself is what
    // is missing. The card says so in the connection's words, and its button
    // asks the browser for the file again instead of re-rendering the same
    // broken component.
    const unreachable = errorLooksOffline(error)
    this.setState({ offline: isOffline() || unreachable, reloadOnRetry: unreachable })
  }

  private retry = () => {
    if (this.props.mode === 'reload' || this.state.reloadOnRetry) {
      window.location.reload()
      return
    }
    // Clearing the failure re-mounts the children, which is what a reader
    // means by"try again".
    this.setState({ failed: false })
  }

  render() {
    if (!this.state.failed) return this.props.children
    // `offline` here already includes what the caught error said: a page whose
    // file did not arrive is a connection problem, not a broken component.
    return <CrashCard copy={this.props.copy} offline={this.state.offline} onRetry={this.retry} />
  }
}

/**
 * Wraps a subtree so a crash inside it becomes a readable message instead of an
 * empty page. Used around the whole app and around the content of the layout,
 * so the header and the section bar survive a page that falls over.
 */
export default function ErrorBoundary({ children, mode = 'reset' }: { children: ReactNode; mode?: 'reset' | 'reload' }) {
  return (
    <CrashBoundary mode={mode} copy={useCrashCopy()}>
      {children}
    </CrashBoundary>
  )
}
