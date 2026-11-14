import { apiClient } from './apiClient'
import type { AdminDashboardStats, Article, AuthResponse, Category, Comment, DashboardStats, Live, LiveComment, User } from '../types'

interface ArticleQuery {
  page?: number
  limit?: number
  search?: string
  category?: string
  tag?: string
  sort?: string
  /** One language code. The audio desk asks for 'en' and nothing else. */
  language?: string
}

interface ArticleResults {
  articles: Article[]
  total: number
}

/** One node of the published section tree, as the backend seeds it. */
export interface SectionRecord {
  _id: string | null
  slug: string
  name: string
  labelKey?: string
  description?: string
  href: string
  aliases?: string[]
  children: SectionRecord[]
}

export interface SectionResults extends ArticleResults {
  section: SectionRecord | null
  child: SectionRecord | null
  category: Category | null
}

/** A writer on the "most followed" shelf, counted by the API from Follow rows. */
export interface TopWriter {
  _id: string
  fullName: string
  username: string
  bio: string
  avatar: string
  followers: number
}

export interface AdminUserRecord extends User {
  articleCount: number
  publishedCount: number
  totalViews: number
}

export interface PagedResult<T> {
  items: T[]
  total: number
  page: number
  limit: number
  pages: number
}

function toPaged<T>(payload: any, key: 'users' | 'articles'): PagedResult<T> {
  const list = Array.isArray(payload?.[key]) ? payload[key] : []
  return { items: list as T[], total: payload?.total || list.length, page: payload?.page || 1, limit: payload?.limit || list.length, pages: payload?.pages || 1 }
}

export const authAPI = {
  register: (data: { fullName: string; username: string; email: string; password: string; country?: string; language?: string }) =>
    apiClient.post<AuthResponse>('/auth/register', data),

  login: (data: { email: string; password: string }) =>
    apiClient.post<AuthResponse>('/auth/login', data),

  googleSignIn: (data: { credential: string }) =>
    apiClient.post<AuthResponse>('/auth/google', data),

  adminLogin: (data: { username: string; password: string }) =>
    apiClient.post<AuthResponse>('/auth/admin-login', data),

  updateCredentials: (data: { currentPassword: string; username?: string; email?: string; fullName?: string; password?: string }) =>
    apiClient.put<AuthResponse>('/auth/credentials', data),

  logout: () =>
    apiClient.post('/auth/logout'),

  getMe: () =>
    apiClient.get<User>('/auth/me'),
}

export const publicAPI = {
  getArticles: (params?: ArticleQuery) =>
    apiClient.get<ArticleResults>('/articles', params),

  getArticleBySlug: (slug: string) =>
    apiClient.get<Article>(`/articles/${slug}`),

  getLatest: () =>
    apiClient.get<ArticleResults>('/latest'),

  getTrending: () =>
    apiClient.get<ArticleResults>('/trending'),

  getPopular: () =>
    apiClient.get<ArticleResults>('/popular'),

  getCategories: () =>
    apiClient.get<Category[]>('/categories'),

  getCategoryArticles: (slug: string, page?: number, limit?: number, sort?: string) =>
    apiClient.get<ArticleResults>(`/categories/${slug}`, { page, limit, sort }),

  getSections: () =>
    apiClient.get<{ sections: SectionRecord[] }>('/sections'),

  getSectionArticles: (section: string, child?: string, page?: number, limit?: number, sort?: string) =>
    apiClient.get<SectionResults>(`/sections/${section}${child ? `/${child}` : ''}`, { page, limit, sort }),

  search: (query: string, page?: number, limit?: number) =>
    apiClient.get<any>('/search', { search: query, page, limit }),

  getWriter: (id: string) =>
    apiClient.get(`/writers/${id}`),

  // Writers counted from real Follow rows, for the home shelf that says
  // "most followed" instead of borrowing the most-read stories.
  getTopWriters: (limit = 6) =>
    apiClient.get<{ writers: TopWriter[] }>('/writers/top', { limit }),

  sendContact: (data: { name: string; email: string; topic: string; message: string; website?: string }) =>
    apiClient.post('/contact', data),
}

export const writerAPI = {
  apply: (data: any) =>
    apiClient.post('/writers/apply', data),

  getStatus: () =>
    apiClient.get('/writers/me/status'),

  createArticle: (data: any) =>
    apiClient.post('/writers/articles', data),

  getMyArticles: (query: WriterStoriesQuery = {}) =>
    apiClient.get<Article[]>('/writers/articles', query),

  // The same shelf, but each row carries the traffic measured from real
  // ArticleView rows. Both lists come back wrapped, so the unwrapping that
  // crashed the earnings page happens once here instead of at every call site.
  getStoryMetrics: async (query: WriterStoriesQuery = {}): Promise<WriterMetricPage> => {
    const response = await apiClient.get('/writers/me/analytics', query)
    const payload = response.data.data as { articles?: WriterStoryMetric[]; total?: number; page?: number; limit?: number; totalPages?: number } | null
    return {
      stories: Array.isArray(payload?.articles) ? payload.articles : [],
      total: Number(payload?.total ?? 0),
      page: Number(payload?.page ?? query.page ?? 1),
      limit: Number(payload?.limit ?? 20),
      totalPages: Number(payload?.totalPages ?? 1),
    }
  },

  getWeeklyStats: () =>
    apiClient.get('/writers/me/weekly-stats'),

  getArticle: (id: string) =>
    apiClient.get(`/writers/articles/${id}`),

  updateArticle: (id: string, data: any) =>
    apiClient.put(`/writers/articles/${id}`, data),

  deleteArticle: (id: string) =>
    apiClient.delete(`/writers/articles/${id}`),

  publishArticle: (id: string) =>
    apiClient.post(`/writers/articles/${id}/publish`),

  submitArticle: (id: string) =>
    apiClient.post(`/writers/articles/${id}/submit`),

  withdrawArticle: (id: string) =>
    apiClient.post(`/writers/articles/${id}/unpublish`),

  getEarnings: () =>
    apiClient.get('/writers/me/earnings'),

  getPayouts: () =>
    apiClient.get('/writers/me/payouts'),

  getDashboard: () =>
    apiClient.get<DashboardStats>('/writers/me/dashboard'),

  followWriter: (id: string) =>
    apiClient.post(`/writers/${id}/follow`),

  unfollowWriter: (id: string) =>
    apiClient.delete(`/writers/${id}/follow`),

  getFollowing: () =>
    apiClient.get('/writers/me/following'),
}

export const articleAPI = {
  getComments: (id: string) =>
    apiClient.get<{ comments: Comment[] }>(`/articles/${id}/comments`),

  addComment: (id: string, data: { content: string }) =>
    apiClient.post<{ comment: Comment }>(`/articles/${id}/comments`, data),

  // Asking the newsroom to look at a comment. It changes nothing the readers can
  // see: the comment stays on the page and waits for a human decision.
  reportComment: (commentId: string, reason?: string) =>
    apiClient.post<{ comment: Comment }>(`/articles/comments/${commentId}/report`, { reason }),

  updateComment: (commentId: string, data: { content: string }) =>
    apiClient.put(`/comments/${commentId}`, data),

  deleteComment: (commentId: string) =>
    apiClient.delete(`/comments/${commentId}`),

  likeArticle: (id: string) =>
    apiClient.post(`/articles/${id}/like`),

  unlikeArticle: (id: string) =>
    apiClient.delete(`/articles/${id}/like`),

  bookmarkArticle: (id: string) =>
    apiClient.post(`/articles/${id}/bookmark`),

  unbookmarkArticle: (id: string) =>
    apiClient.delete(`/articles/${id}/bookmark`),

  followWriter: (writerId: string) =>
    apiClient.post(`/writers/${writerId}/follow`),

  unfollowWriter: (writerId: string) =>
    apiClient.delete(`/writers/${writerId}/follow`),

  reportArticle: (id: string, data: { reason: string; details?: string }) =>
    apiClient.post(`/articles/${id}/report`, data),
}

export const userAPI = {
  getMe: () =>
    apiClient.get<any>('/users/me'),
  updateMe: (data: any) =>
    apiClient.put<any>('/users/me', data),
  getBookmarks: () =>
    apiClient.get('/users/me/bookmarks'),
  getFollowing: () =>
    apiClient.get<any>('/users/me/following'),
  getMyStats: () =>
    apiClient.get<any>('/users/me/stats'),
  getProfile: (id: string) =>
    apiClient.get<any>(`/users/${id}/profile`),
}

export const notificationAPI = {
  getNotifications: () =>
    apiClient.get('/notifications'),

  markAsRead: (id: string) =>
    apiClient.put(`/notifications/${id}/read`),

  markAllAsRead: () =>
    apiClient.put('/notifications/read-all'),
}

/** How a story is written, so a queue never has to guess which copy to show. */
export type StoryState = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'published' | 'archived'

// One of the writer's own stories with the traffic measured from real ArticleView
// rows. hasViewData is false when nobody has opened it yet, which is different
// from an average read time of zero; the UI only prints a number when it is true.
// The verbs the API says this author may run on this story. The shelf renders
// its buttons straight from this list, so it can never offer a call the backend
// is going to refuse.
export type StoryAction = 'submit' | 'publish' | 'withdraw' | 'delete'

export interface WriterStoryMetric {
  _id: string
  title: string
  slug: string
  summary: string
  featuredImage: string | null
  status: StoryState
  actions: StoryAction[]
  publishedAt: string | null
  views: number
  validViews: number
  uniqueViews: number
  likes: number
  commentsCount: number
  readingTime: number
  viewRows: number
  hasViewData: boolean
  traffic: { day: string; validViews: number }[]
  averageReadingDurationSeconds: number | null
}

export interface WriterMetricPage {
  stories: WriterStoryMetric[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface WriterStoriesQuery {
  status?: StoryState | ''
  page?: number
  limit?: number
  sort?: 'newest' | 'oldest' | 'views' | 'likes'
  search?: string
}

export interface StoryQueueResult {
  articles: Article[]
  total: number
  page: number
  limit: number
  totalPages: number
  status: StoryState
  pendingCount: number
}

export type CommentState = 'active' | 'reported' | 'hidden' | 'deleted'

// A comment as the moderation desk sees it: the words, who wrote them, the story
// they sit under, and how many readers asked for a look. `reports` is a count on
// purpose - the people behind it stay unnamed.
export interface ModeratedComment {
  _id: string
  content: string
  status: CommentState
  reports: number
  reportReason?: string
  moderationNote?: string
  createdAt?: string
  updatedAt?: string
  moderatedAt?: string | null
  user?: { _id: string; fullName?: string; username?: string; role?: string } | null
  article?: { _id: string; title?: string; slug?: string; status?: string } | null
  moderatedBy?: { _id: string; fullName?: string; username?: string; role?: string } | null
}

export interface CommentQueueResult {
  comments: ModeratedComment[]
  total: number
  page: number
  limit: number
  totalPages: number
  status: CommentState
  counts: Record<CommentState, number>
}

export const editorAPI = {
  // The queue an editor works from. An empty list is a real answer, so the
  // caller never has to tell "nobody submitted anything" from "the request
  // failed" - that distinction is what keeps the UI honest.
  getQueue: async (status: StoryState = 'pending_review', page = 1, search = ''): Promise<StoryQueueResult> => {
    const response = await apiClient.get('/editor/articles', { status, page, search })
    const payload = response.data.data as Partial<StoryQueueResult> | null
    return {
      articles: Array.isArray(payload?.articles) ? payload.articles : [],
      total: Number(payload?.total ?? 0),
      page: Number(payload?.page ?? page),
      limit: Number(payload?.limit ?? 20),
      totalPages: Number(payload?.totalPages ?? 1),
      status: (payload?.status as StoryState) || status,
      pendingCount: Number(payload?.pendingCount ?? 0),
    }
  },

  getPendingArticles: () =>
    apiClient.get('/editor/articles/pending'),

  getArticle: (id: string) =>
    apiClient.get(`/editor/articles/${id}`),

  getHistory: (id: string) =>
    apiClient.get(`/editor/articles/${id}/history`),

  getStats: () =>
    apiClient.get('/editor/stats'),

  approveArticle: (id: string, note?: string) =>
    apiClient.put(`/editor/articles/${id}/approve`, { note }),

  rejectArticle: (id: string, note?: string) =>
    apiClient.put(`/editor/articles/${id}/reject`, { note }),

  requestCorrection: (id: string, note?: string) =>
    apiClient.put(`/editor/articles/${id}/request-correction`, { note }),

  publishArticle: (id: string) =>
    apiClient.put(`/editor/articles/${id}/publish`),

  unpublishArticle: (id: string) =>
    apiClient.put(`/editor/articles/${id}/unpublish`),

  restoreArticle: (id: string) =>
    apiClient.put(`/editor/articles/${id}/restore`),

  archiveArticle: (id: string) =>
    apiClient.put(`/editor/articles/${id}/archive`),

  scheduleArticle: (id: string, scheduledAt?: string) =>
    apiClient.put(`/editor/articles/${id}/schedule`, { scheduledAt }),

  // The comment queue. How many readers flagged a comment is returned, never
  // which ones.
  getComments: async (status: CommentState = 'reported', page = 1, search = ''): Promise<CommentQueueResult> => {
    const response = await apiClient.get('/editor/comments', { status, page, search })
    const payload = response.data.data as Partial<CommentQueueResult> | null
    return {
      comments: Array.isArray(payload?.comments) ? payload.comments : [],
      total: Number(payload?.total ?? 0),
      page: Number(payload?.page ?? page),
      limit: Number(payload?.limit ?? 25),
      totalPages: Number(payload?.totalPages ?? 1),
      status: (payload?.status as CommentState) || status,
      counts: {
        active: Number(payload?.counts?.active ?? 0),
        reported: Number(payload?.counts?.reported ?? 0),
        hidden: Number(payload?.counts?.hidden ?? 0),
        deleted: Number(payload?.counts?.deleted ?? 0),
      },
    }
  },

  moderateComment: (id: string, action: 'hide' | 'restore' | 'delete', note?: string) =>
    apiClient.put(`/editor/comments/${id}/moderate`, { action, note }),
}

export interface WriterApplicationRecord {
  _id: string
  status: 'pending' | 'approved' | 'rejected' | 'suspended'
  fullName: string
  username: string
  reasonForWriting?: string
  bio?: string
  country?: string
  createdAt?: string
  user?: User & { isActive?: boolean }
}

export interface WriterRequestsResult {
  applications: WriterApplicationRecord[]
  pendingCount: number
}

export interface AiWriterStatus {
  configured: boolean
  model: string
  autoPublish: boolean
}

export interface AiDraftResult {
  title: string
  summary: string
  metaDescription?: string
  paragraphs: string[]
  content: string
  tags: string[]
  model: string
  generatedAt: string
  /** Set when the draft was built on a topic Google actually reported. */
  evidence?: {
    provider: string
    geo: string
    region: string
    day: string
    topic: string
    trafficLabel: string
    approxTraffic: number | null
    sourceUrl: string
    fetchedAt: string
    headlines: { title: string; url: string; source: string; picture?: string }[]
  }
  /** The picture and publisher the feed printed beside the trend, if any. */
  photo?: { url: string; source: string; articleUrl: string; caption: string } | null
  destination?: string
}

/** One search Google reported as trending, with the headlines it credited. */
export interface TrendTopicRecord {
  topic: string
  trafficLabel: string
  approxTraffic: number | null
  seenAt: string | null
  sourceUrl: string
  headlines: { title: string; url: string; source: string }[]
  storedDay?: string
  lastSeenAt?: string
}

export interface TrendGeoRecord {
  geo: string
  name: string
  ok: boolean
  status: number | null
  reason: string | null
  stale: boolean
  fetchedAt: string
  sourceUrl: string
  topics: TrendTopicRecord[]
}

export interface TrendRadar {
  provider: string
  providerUrl: string
  geos: TrendGeoRecord[]
  liveRegions: number
  cacheMinutes: number
  checkedAt: string
}

/** One message a reader sent through /contact. */
export interface ContactMessageRecord {
  _id: string
  name: string
  email: string
  topic: 'correction' | 'story-tip' | 'advertising' | 'writer-access' | 'other'
  message: string
  status: 'open' | 'answered' | 'closed'
  createdAt: string
  handledAt?: string | null
  handledBy?: { fullName?: string; username?: string } | null
}

export interface ContactInbox {
  messages: ContactMessageRecord[]
  total: number
  openCount: number
}

export const adminAPI = {
  getDashboard: () =>
    apiClient.get<AdminDashboardStats>('/admin/dashboard'),

  getEarnings: () =>
    apiClient.get('/admin/earnings'),

  getPayouts: () =>
    apiClient.get('/admin/payouts'),

  approvePayout: (id: string) =>
    apiClient.put(`/admin/payouts/${id}/approve`),

  rejectPayout: (id: string, reason?: string) =>
    apiClient.put(`/admin/payouts/${id}/reject`, { rejectionReason: reason }),

  markPayoutPaid: (id: string) =>
    apiClient.put(`/admin/payouts/${id}/mark-paid`),

  getContactMessages: async (status?: string): Promise<ContactInbox> => {
    const response = await apiClient.get('/admin/contact-messages', { status })
    const payload = response.data.data as Partial<ContactInbox> | null
    return {
      messages: Array.isArray(payload?.messages) ? payload.messages : [],
      total: Number(payload?.total ?? 0),
      openCount: Number(payload?.openCount ?? 0),
    }
  },

  setContactMessageStatus: (id: string, status: ContactMessageRecord['status']) =>
    apiClient.put(`/admin/contact-messages/${id}/status`, { status }),

  deleteContactMessage: (id: string) =>
    apiClient.delete(`/admin/contact-messages/${id}`),

  getSettings: () =>
    apiClient.get('/admin/settings'),

  getUsers: async (params?: { page?: number; limit?: number; role?: string; search?: string }) => {
    const response = await apiClient.get('/admin/users', params)
    return toPaged<AdminUserRecord>(response.data.data, 'users')
  },

  getUser: (id: string) =>
    apiClient.get(`/admin/users/${id}`),

  updateUser: (id: string, data: { role?: string; isActive?: boolean; writerStatus?: string }) =>
    apiClient.put(`/admin/users/${id}`, data),

  getWriterRequests: async (status?: string): Promise<WriterRequestsResult> => {
    const response = await apiClient.get('/admin/writer-requests', status ? { status } : undefined)
    const payload = response.data.data as { applications?: WriterApplicationRecord[]; pendingCount?: number }
    return { applications: payload?.applications ?? [], pendingCount: payload?.pendingCount ?? 0 }
  },

  approveWriterRequest: (id: string) =>
    apiClient.post(`/admin/writer-requests/${id}/approve`),

  rejectWriterRequest: (id: string) =>
    apiClient.post(`/admin/writer-requests/${id}/reject`),

  getArticles: async (params?: { page?: number; limit?: number; status?: string; category?: string; search?: string; sort?: string }) => {
    const response = await apiClient.get('/admin/articles', params)
    return toPaged<Article>(response.data.data, 'articles')
  },

  updateArticleStatus: (id: string, status: string) =>
    apiClient.put(`/admin/articles/${id}/status`, { status }),

  deleteArticle: (id: string) =>
    apiClient.delete(`/admin/articles/${id}`),

  getAiStatus: async (): Promise<AiWriterStatus> => {
    const response = await apiClient.get('/admin/ai/status')
    const payload = response.data.data as Partial<AiWriterStatus> | undefined
    return {
      configured: Boolean(payload?.configured),
      model: payload?.model || '',
      autoPublish: payload?.autoPublish === true
    }
  },

  setAiAutoPublish: (enabled: boolean) =>
    apiClient.put('/admin/ai/auto-publish', { enabled }),

  generateAiDraft: async (input: { topic: string; angle?: string; audience?: 'rwanda' | 'world' }): Promise<AiDraftResult> => {
    const response = await apiClient.post('/admin/ai/generate', input)
    return response.data.data as AiDraftResult
  },

  /** A story built on one topic from the fetched trending list. */
  generateTrendDraft: async (input: { geo: string; topic: string; angle?: string; audience?: 'rwanda' | 'world' }): Promise<AiDraftResult> => {
    const response = await apiClient.post('/admin/ai/trends', input)
    return response.data.data as AiDraftResult
  },

  saveAiArticle: async (payload: {
    title: string
    summary: string
    metaDescription?: string
    content: string
    category: string
    tags: string[]
    featuredImage?: string
    imageCredit?: string
    imageSourceUrl?: string
    publish: boolean
  }): Promise<Article> => {
    const response = await apiClient.post('/admin/ai/articles', payload)
    return (response.data.data as { article: Article }).article
  },

  getAiArticles: async (): Promise<{ articles: Article[]; pendingReview: number }> => {
    const response = await apiClient.get('/admin/ai/articles')
    const payload = response.data.data as { articles?: Article[]; pendingReview?: number }
    return { articles: payload?.articles ?? [], pendingReview: payload?.pendingReview ?? 0 }
  },

  /** What Google reports people searching, read by the server. */
  getTrends: async (refresh = false): Promise<TrendRadar> => {
    const response = await apiClient.get('/admin/trends', refresh ? { refresh: '1' } : undefined)
    const payload = response.data.data as Partial<TrendRadar> | null
    return {
      provider: payload?.provider || 'google-trends',
      providerUrl: payload?.providerUrl || 'https://trends.google.com/',
      geos: Array.isArray(payload?.geos) ? payload.geos : [],
      liveRegions: Number(payload?.liveRegions ?? 0),
      cacheMinutes: Number(payload?.cacheMinutes ?? 15),
      checkedAt: payload?.checkedAt || '',
    }
  },
}

export const pushAPI = {  getStatus: () =>
    apiClient.get<{ enabled: boolean }>('/push/status'),

  getSubscribers: () =>
    apiClient.get<{ count: number; enabled: boolean }>('/push/subscriptions'),

  broadcast: (payload: { title: string; body: string; url?: string }) =>
    apiClient.post<{ sent: number; failed: number; expired: number; total: number }>('/push/broadcast', payload),
}

export interface NewsletterSubscribeResult {
  delivered: boolean
  needsConfirmation: boolean
  configured: boolean
  message: string
}

export const newsletterAPI = {
  // The server admits whether a mail sender exists at all, so the page can say
  // "nothing will arrive yet" instead of pretending a mail was sent.
  getStatus: async (): Promise<{ configured: boolean; reason: string | null }> => {
    const response = await apiClient.get('/newsletter/status')
    const payload = (response.data?.data || {}) as { configured?: boolean; reason?: string | null }
    return { configured: payload.configured === true, reason: payload.reason || null }
  },

  subscribe: async (
    email: string,
    source = 'home',
  ): Promise<NewsletterSubscribeResult> => {
    const response = await apiClient.post('/newsletter/subscribe', { email, source })
    const payload = (response.data?.data || {}) as { delivered?: boolean; needsConfirmation?: boolean; configured?: boolean }
    return {
      delivered: payload.delivered === true,
      needsConfirmation: payload.needsConfirmation === true,
      configured: payload.configured === true,
      message: response.data?.message || '',
    }
  },
}

export const liveAPI = {
  getCurrent: () =>
    apiClient.get<{ live: Live | null }>('/live/current'),

  get: (id: string) =>
    apiClient.get<{ live: Live }>(`/live/${id}`),

  list: () =>
    apiClient.get<{ lives: Live[] }>('/live', { params: { limit: 10 } }),

  start: (payload: { title: string; description?: string }) =>
    apiClient.post<{ live: Live }>('/live', payload),

  end: (id: string) =>
    apiClient.post<{ live: Live }>(`/live/${id}/end`),

  getComments: (id: string) =>
    apiClient.get<{ comments: LiveComment[] }>(`/live/${id}/comments`),
}

export interface TranslateLanguage {
  code: string
  name: string
}

export interface TranslateStatus {
  configured: boolean
  defaultLanguage: string
  reason: string | null
}

/**
 * The reader's language. The key stays on the server; the browser only ever
 * asks for a language and gets words back.
 */
export const translateAPI = {
  getLanguages: async (): Promise<{ languages: TranslateLanguage[] } & TranslateStatus> => {
    const response = await apiClient.get('/translate/languages')
    const payload = (response.data?.data || {}) as Partial<{ languages: TranslateLanguage[] } & TranslateStatus>
    return {
      languages: Array.isArray(payload.languages) ? payload.languages : [],
      configured: payload.configured === true,
      defaultLanguage: payload.defaultLanguage || 'en',
      reason: payload.reason ?? null,
    }
  },

  // The site's own buttons and labels, as one set, bought once and cached by
  // both the server and this browser.
  translateChrome: async (
    lang: string,
    strings: Record<string, string>,
  ): Promise<{ translated: boolean; strings: Record<string, string>; reason: string | null } & TranslateStatus> => {
    const response = await apiClient.post('/translate/chrome', { lang, strings })
    const payload = (response.data?.data || {}) as Record<string, unknown>
    return {
      translated: payload.translated === true,
      strings: payload.strings && typeof payload.strings === 'object' ? (payload.strings as Record<string, string>) : {},
      reason: typeof payload.reason === 'string' ? payload.reason : null,
      configured: payload.configured === true,
      defaultLanguage: (payload.defaultLanguage as string) || 'en',
    }
  },
}