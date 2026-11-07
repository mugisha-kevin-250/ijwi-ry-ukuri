import { useEffect, useRef, useSyncExternalStore } from 'react'
import { articleAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { requestSignIn } from './signInPrompt'

export interface LikeState {
  liked: boolean
  likes: number
}

type Patch =
  | { kind: 'like'; id: string; state: LikeState }
  | { kind: 'follow'; id: string; state: boolean }
  | { kind: 'bookmark'; id: string; state: boolean }

const likeStore = new Map<string, LikeState>()
const followStore = new Map<string, boolean>()
const bookmarkStore = new Map<string, boolean>()
// Keys with a request in flight. A background refetch must not overwrite the
// state the reader just painted.
const pending = new Set<string>()

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify() {
  for (const listener of listeners) listener()
}

// Every tab of an installed PWA shows the same state the moment one of them
// changes it, without waiting for a reload.
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ijwi-engagement') : null
if (channel) {
  channel.onmessage = (event: MessageEvent<Patch>) => {
    const patch = event.data
    if (!patch || typeof patch !== 'object' || !patch.id) return
    apply(patch)
    notify()
  }
}

function apply(patch: Patch) {
  if (patch.kind === 'like') likeStore.set(patch.id, patch.state)
  else if (patch.kind === 'follow') followStore.set(patch.id, patch.state)
  else bookmarkStore.set(patch.id, patch.state)
}

// echo=false adopts a value that already came from the server or from another
// tab, so it must not be broadcast back.
function publish(patch: Patch, echo = true) {
  apply(patch)
  if (echo && channel) channel.postMessage(patch)
  notify()
}

export function useArticleLike(article?: { _id?: string; likes?: number; liked?: boolean } | null) {
  const { user } = useAuth()
  const id = article?._id
  const stored = useSyncExternalStore(subscribe, () => (id ? likeStore.get(id) : undefined))
  const serverState: LikeState = { liked: Boolean(article?.liked), likes: Number(article?.likes || 0) }
  const current = stored || serverState

  useEffect(() => {
    if (!id || pending.has(`like:${id}`)) return
    const known = likeStore.get(id)
    if (!known || known.liked !== serverState.liked || known.likes !== serverState.likes) {
      publish({ kind: 'like', id, state: serverState }, false)
    }
  }, [id, serverState.liked, serverState.likes])

  const toggle = async () => {
    if (!id) return
    if (!user) {
      requestSignIn()
      return
    }
    const key = `like:${id}`
    const before = { ...current }
    const next: LikeState = { liked: !current.liked, likes: Math.max(0, current.likes + (current.liked ? -1 : 1)) }
    pending.add(key)
    publish({ kind: 'like', id, state: next })
    try {
      const response = next.liked ? await articleAPI.likeArticle(id) : await articleAPI.unlikeArticle(id)
      const serverLikes = (response.data.data as any)?.likes
      publish({
        kind: 'like',
        id,
        state: { liked: next.liked, likes: typeof serverLikes === 'number' ? serverLikes : next.likes },
      })
    } catch (error) {
      publish({ kind: 'like', id, state: before })
      console.error('Failed to like article:', error)
    } finally {
      pending.delete(key)
    }
  }

  return { liked: current.liked, likes: current.likes, toggle }
}

export function useAuthorFollow(writerId?: string | null, serverFollowing?: boolean) {
  const { user } = useAuth()
  const stored = useSyncExternalStore(subscribe, () => (writerId ? followStore.get(writerId) : undefined))
  const following = stored ?? Boolean(serverFollowing)

  useEffect(() => {
    if (!writerId || pending.has(`follow:${writerId}`)) return
    if (followStore.get(writerId) !== serverFollowing) {
      publish({ kind: 'follow', id: writerId, state: Boolean(serverFollowing) }, false)
    }
  }, [writerId, serverFollowing])

  const toggle = async () => {
    if (!writerId) return
    if (!user) {
      requestSignIn()
      return
    }
    const key = `follow:${writerId}`
    const next = !following
    pending.add(key)
    publish({ kind: 'follow', id: writerId, state: next })
    try {
      if (next) await articleAPI.followWriter(writerId)
      else await articleAPI.unfollowWriter(writerId)
    } catch (error) {
      publish({ kind: 'follow', id: writerId, state: following })
      console.error('Failed to follow author:', error)
    } finally {
      pending.delete(key)
    }
  }

  return { following, toggle }
}

export function useArticleBookmark(article?: { _id?: string; bookmarked?: boolean } | null) {
  const { user } = useAuth()
  const id = article?._id
  const stored = useSyncExternalStore(subscribe, () => (id ? bookmarkStore.get(id) : undefined))
  const bookmarked = stored ?? Boolean(article?.bookmarked)

  useEffect(() => {
    if (!id || pending.has(`bookmark:${id}`)) return
    if (bookmarkStore.get(id) !== Boolean(article?.bookmarked)) {
      publish({ kind: 'bookmark', id, state: Boolean(article?.bookmarked) }, false)
    }
  }, [id, article?.bookmarked])

  const toggle = async () => {
    if (!id) return
    if (!user) {
      requestSignIn()
      return
    }
    const key = `bookmark:${id}`
    const next = !bookmarked
    pending.add(key)
    publish({ kind: 'bookmark', id, state: next })
    try {
      if (next) await articleAPI.bookmarkArticle(id)
      else await articleAPI.unbookmarkArticle(id)
    } catch (error) {
      publish({ kind: 'bookmark', id, state: bookmarked })
      console.error('Failed to bookmark article:', error)
    } finally {
      pending.delete(key)
    }
  }

  return { bookmarked, toggle }
}

// Pull the story again while it is open so other readers' likes and views
// arrive without a manual reload. Stays quiet in a hidden tab.
export function useVisiblePoll(callback: () => void, intervalMs = 30000) {
  const latest = useRef(callback)
  latest.current = callback

  useEffect(() => {
    const run = () => {
      if (document.visibilityState === 'visible') latest.current()
    }
    const timer = window.setInterval(run, intervalMs)
    document.addEventListener('visibilitychange', run)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', run)
    }
  }, [intervalMs])
}
