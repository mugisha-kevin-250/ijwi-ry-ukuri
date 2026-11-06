import { useEffect } from 'react'
import { apiClient } from '../services/apiClient'

const SESSION_KEY = 'anon_session_id'
// A visit shorter than this is a bounce, not a read.
const MIN_REPORT_MS = 1500

export function anonymousSessionId(): string {
  let stored = localStorage.getItem(SESSION_KEY)
  if (!stored) {
    stored = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem(SESSION_KEY, stored)
  }
  return stored
}

// fetch instead of axios: keepalive lets the report survive the tab closing, which is
// exactly when a read finishes.
function postView(articleId: string, readingDurationMs: number) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem('token')
  if (token) headers.Authorization = `Bearer ${token}`
  return fetch(`${apiClient.baseURL}/articles/${articleId}/view`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ readingDurationMs, anonymousSessionId: anonymousSessionId() }),
    keepalive: true,
  }).catch(() => undefined)
}

// Counts the time the reader actually spends on the article, then reports it once when
// they leave (route change, tab hidden or tab closed).
export function useArticleViewTracking(articleId?: string) {
  useEffect(() => {
    if (!articleId) return undefined

    let visibleMs = 0
    let visibleSince = document.visibilityState === 'visible' ? Date.now() : 0
    let reported = false

    const pause = () => {
      if (!visibleSince) return
      visibleMs += Date.now() - visibleSince
      visibleSince = 0
    }
    const report = () => {
      if (reported) return
      reported = true
      pause()
      if (visibleMs >= MIN_REPORT_MS) void postView(articleId, visibleMs)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') pause()
      else if (!reported) visibleSince = Date.now()
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', report)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', report)
      report()
    }
  }, [articleId])
}
