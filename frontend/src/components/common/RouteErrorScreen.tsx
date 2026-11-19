import { useRouteError } from 'react-router-dom'
import { CrashCard, useCrashCopy } from './ErrorBoundary'
import { errorLooksOffline } from '../../utils/crashMessages'

/**
 * What a reader sees when a page cannot be put on screen at all.
 *
 * Every page in this app is downloaded only when it is asked for, so a story
 * opened on a dead network fails before React has the code for it, and the
 * router's own answer used to be a wall of red text - the message the newsroom
 * reported. This replaces it everywhere: the same card the error boundary
 * shows, with the connection named when the connection is the reason, and a
 * retry that reloads the document because the missing file has to be asked for
 * again from scratch.
 */
export default function RouteErrorScreen() {
  const error = useRouteError()
  const copy = useCrashCopy()

  // Nothing here is a reader's problem to read. Staff can find it in the
  // console, which is where the router already logs it too.
  console.error('[radar] route failed to render', error)

  return <CrashCard copy={copy} offline={errorLooksOffline(error)} onRetry={() => window.location.reload()} />
}
