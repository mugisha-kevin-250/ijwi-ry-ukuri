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

/**
 * One section as the admin desk sees it: the stored document, plus the two
 * facts that decide what can safely be done with it.
 */
export interface AdminSectionRecord {
  _id: string
  name: string
  slug: string
  description: string
  parent: string | null
  parentName: string
  order: number
  aliases: string[]
  labelKey: string
  isActive: boolean
  /** Stories filed here and under every spelling of the same section. */
  storyCount: number
  /** Whether the published address table owns this slug: if it does, the
   *  section's web address is fixed and only its name can move. */
  inSectionTree: boolean
  updatedAt: string
}

/** What the desk sends for a section. `slug` is optional: the name makes one. */
export interface SectionDraft {
  name: string
  slug?: string
  description?: string
  parent?: string | null
  order?: number
  aliases?: string[]
  isActive?: boolean
}

/** The spaces on the site an advertisement can be sold into. */
export const AD_PLACEMENT_CHOICES = ['nav', 'list', 'articleInline', 'articleSidebar', 'newsRail'] as const
export type AdPlacementName = (typeof AD_PLACEMENT_CHOICES)[number] | 'any'

export type AdStatus = 'draft' | 'live' | 'paused'

/** One campaign as the advertising desk sees it, brief and history included. */
export interface AdminAdRecord {
  _id: string
  advertiser: string
  headline: string
  body: string
  ctaLabel: string
  link: string
  image: string
  placements: AdPlacementName[]
  theme: { bg: string; fg: string; accent: string }
  status: AdStatus
  startsAt: string | null
  endsAt: string | null
  priority: number
  clicks: number
  source: 'desk' | 'ai'
  model: string
  brief: string
  note: string
  createdBy: { fullName?: string; username?: string } | null
  updatedBy: { fullName?: string; username?: string } | null
  publishedBy: { fullName?: string; username?: string } | null
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  /** Live and inside its booked window right now. */
  isRunning: boolean
}

/** What the desk sends for a campaign. Every field is optional on an update. */
export interface AdDraft {
  advertiser?: string
  headline?: string
  body?: string
  ctaLabel?: string
  link?: string
  image?: string
  placements?: AdPlacementName[]
  theme?: { bg?: string; fg?: string; accent?: string }
  status?: AdStatus
  startsAt?: string | null
  endsAt?: string | null
  priority?: number
  source?: 'desk' | 'ai'
  model?: string
  brief?: string
  note?: string
}

/** The brief an admin types when they want Gemini to design the creative. */
export interface AdBrief {
  advertiser: string
  offer: string
  link?: string
  placement?: AdPlacementName
  tone?: string
  mustInclude?: string
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

  sendContact: (data: { name: string; email: string; phone?: string; topic: string; message: string; website?: string }) =>
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

/**
 * One turn of the research desk conversation.
 *
 * The thread is kept on the server against the admin's own account so a second
 * tab, or a phone, picks up the same questions rather than starting cold.
 */
export interface AiChatTurn {
  role: 'user' | 'assistant'
  text: string
  model?: string
  at?: string
}

export interface AiChatThread {
  configured: boolean
  model: string
  turns: AiChatTurn[]
}

/**
 * A photograph the server actually fetched before offering it here.
 *
 * `width`/`height` are read off the bytes of the picture, and `served` says
 * whether that is the file's own size or a rendition the host made on request,
 * so a picker never shows a thumbnail as though it were a 4K original.
 */
export interface VerifiedPhoto {
  url: string
  originalUrl: string
  /** The page the licence and the contributor are written on, when the host has one. */
  pageUrl: string
  credit: string
  source: string
  why: string
  width: number
  height: number
  bytes: number
  served: string
  atUhd: boolean
}

export interface PhotoSearchResult {
  photos: VerifiedPhoto[]
  dropped: { url: string; credit?: string; reason: string }[]
  asked: number
  model: string
  note?: string
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
  /** Only when the reader chose to leave one - a business asking about a banner
   *  usually prefers a call to an email thread. */
  phone?: string
  topic: 'correction' | 'story-tip' | 'advertising' | 'writer-access' | 'other'
  message: string
  status: 'open' | 'answered' | 'closed'
  createdAt: string
  handledAt?: string | null
  handledBy?: { fullName?: string; username?: string } | null
}

/**
 * One campaign, read defensively.
 *
 * This list is what an admin uses to decide what is on the site and who it is
 * from, so a row with something missing must not turn into "undefined" printed on
 * a screen or a campaign that looks like it has no link. Anything the server did
 * not send comes back empty and the interface says so.
 */
function toAdminAd(raw: unknown): AdminAdRecord {
  const item = (raw || {}) as Record<string, unknown>
  const text = (value: unknown) => (typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value))
  const theme = (item.theme || {}) as Record<string, unknown>
  const person = (value: unknown) => {
    if (!value || typeof value !== 'object') return null
    const who = value as Record<string, unknown>
    return { fullName: text(who.fullName), username: text(who.username) }
  }
  const when = (value: unknown) => (typeof value === 'string' ? value : null)
  const placements = Array.isArray(item.placements) ? item.placements.map(String) : []
  return {
    _id: text(item._id),
    advertiser: text(item.advertiser),
    headline: text(item.headline),
    body: text(item.body),
    ctaLabel: text(item.ctaLabel),
    link: text(item.link),
    image: text(item.image),
    placements: (placements.length ? placements : ['nav']) as AdPlacementName[],
    theme: { bg: text(theme.bg), fg: text(theme.fg), accent: text(theme.accent) },
    status: item.status === 'live' || item.status === 'paused' ? item.status : 'draft',
    startsAt: when(item.startsAt),
    endsAt: when(item.endsAt),
    priority: Number(item.priority ?? 0) || 0,
    clicks: Number(item.clicks ?? 0) || 0,
    source: item.source === 'ai' ? 'ai' : 'desk',
    model: text(item.model),
    brief: text(item.brief),
    note: text(item.note),
    createdBy: person(item.createdBy),
    updatedBy: person(item.updatedBy),
    publishedBy: person(item.publishedBy),
    publishedAt: when(item.publishedAt),
    createdAt: text(item.createdAt),
    updatedAt: text(item.updatedAt),
    isRunning: item.isRunning === true,
  }
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

  /**
   * The section desk.
   *
   * Every read is normalised because this list decides what an admin is allowed
   * to delete: a missing story count read as zero would be an invitation to
   * remove a section that still holds reports.
   */
  getSections: async (): Promise<AdminSectionRecord[]> => {
    const response = await apiClient.get<{ categories?: unknown[] }>('/admin/categories')
    const rows = Array.isArray(response.data.data?.categories) ? response.data.data.categories : []
    return rows.map((raw) => {
      const item = (raw || {}) as Record<string, unknown>
      const text = (value: unknown) => (typeof value === 'string' ? value : '')
      return {
        _id: text(item._id),
        name: text(item.name),
        slug: text(item.slug),
        description: text(item.description),
        parent: typeof item.parent === 'string' ? item.parent : null,
        parentName: text(item.parentName),
        order: Number(item.order ?? 0) || 0,
        aliases: Array.isArray(item.aliases) ? item.aliases.map(String) : [],
        labelKey: text(item.labelKey),
        isActive: item.isActive !== false,
        storyCount: Number(item.storyCount ?? 0) || 0,
        inSectionTree: item.inSectionTree === true,
        updatedAt: text(item.updatedAt),
      }
    })
  },

  createSection: (input: SectionDraft) =>
    apiClient.post<{ category: AdminSectionRecord }>('/admin/categories', input),

  updateSection: (id: string, input: SectionDraft) =>
    apiClient.put<{ category: AdminSectionRecord }>(`/admin/categories/${id}`, input),

  deleteSection: (id: string, moveTo?: string | null) =>
    apiClient.delete(`/admin/categories/${id}${moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : ''}`),

  /**
   * The advertising desk.
   *
   * A generated creative comes back from the server unsaved on purpose: the model
   * writes, an admin reads it, and only saving it puts it on the site.
   */
  getAds: async (): Promise<AdminAdRecord[]> => {
    const response = await apiClient.get<{ ads?: unknown[] }>('/admin/ads')
    const rows = Array.isArray(response.data.data?.ads) ? response.data.data.ads : []
    return rows.map(toAdminAd)
  },

  generateAd: async (brief: AdBrief): Promise<AdDraft> => {
    const response = await apiClient.post<AdDraft>('/admin/ads/generate', brief)
    const draft = (response.data.data || {}) as Record<string, unknown>
    const theme = (draft.theme || {}) as Record<string, unknown>
    // Only a string is a string: an absent field has to come back empty, because
    // "undefined" in a colour box or a headline field is a bug a reader would see.
    const text = (value: unknown) => (typeof value === 'string' ? value : '')
    return {
      advertiser: text(draft.advertiser) || brief.advertiser,
      headline: text(draft.headline),
      body: text(draft.body),
      ctaLabel: text(draft.ctaLabel),
      link: text(draft.link) || brief.link || '',
      placements: Array.isArray(draft.placements) ? (draft.placements.map(String) as AdPlacementName[]) : [brief.placement || 'nav'],
      theme: { bg: text(theme.bg), fg: text(theme.fg), accent: text(theme.accent) },
      brief: text(draft.brief) || brief.offer,
      model: text(draft.model),
      source: 'ai',
      status: 'draft',
    }
  },

  createAd: (input: AdDraft) => apiClient.post<{ ad: AdminAdRecord }>('/admin/ads', input),

  updateAd: (id: string, input: AdDraft) => apiClient.put<{ ad: AdminAdRecord }>(`/admin/ads/${id}`, input),

  deleteAd: (id: string) => apiClient.delete(`/admin/ads/${id}`),

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

  // The research desk. Questions and answers stay in the admin's own thread on
  // the server, and nothing here is ever a story - it is leads to check.
  getAiChat: async (): Promise<AiChatThread> => {
    const response = await apiClient.get('/admin/ai/chat')
    const payload = response.data.data as Partial<AiChatThread> | undefined
    return {
      configured: payload?.configured === true,
      model: payload?.model || '',
      turns: Array.isArray(payload?.turns) ? payload.turns : [],
    }
  },

  askAiChat: async (message: string): Promise<AiChatThread> => {
    const response = await apiClient.post('/admin/ai/chat', { message })
    const payload = response.data.data as Partial<AiChatThread> | undefined
    return {
      configured: true,
      model: payload?.model || '',
      turns: Array.isArray(payload?.turns) ? payload.turns : [],
    }
  },

  clearAiChat: () => apiClient.delete('/admin/ai/chat'),

  /**
   * Pictures a story could carry, each one already fetched and measured by the
   * server. A link that did not load is returned in `dropped` with the reason,
   * so the panel can say what is missing instead of showing fewer boxes.
   */
  searchAiPhotos: async (input: { topic: string; region?: string }): Promise<PhotoSearchResult> => {
    const response = await apiClient.post('/admin/ai/photos', input)
    const payload = response.data.data as Partial<PhotoSearchResult> | undefined
    return {
      photos: Array.isArray(payload?.photos) ? payload.photos : [],
      dropped: Array.isArray(payload?.dropped) ? payload.dropped : [],
      asked: Number(payload?.asked ?? 0),
      model: payload?.model || '',
      note: payload?.note || '',
    }
  },

  /**
   * The radio timetable, as the admin set it.
   *
   * Saving replaces the whole list rather than patching one row: a timetable with
   * two programmes at 18:00 and no way to say which one won is exactly the sort of
   * state the desk must not be allowed to reach, so the server is handed the whole
   * day and refuses it or accepts it as one piece.
   */
  getRadioSchedule: async (): Promise<RadioScheduleResponse> => {
    const response = await apiClient.get<RadioScheduleResponse>('/admin/radio/schedule')
    return normaliseSchedule(response.data.data)
  },

  saveRadioSchedule: async (input: { timezone: string; slots: Omit<RadioSlot, '_id'>[] }): Promise<RadioScheduleResponse> => {
    const response = await apiClient.put<RadioScheduleResponse>('/admin/radio/schedule', input)
    return normaliseSchedule(response.data.data)
  },

  /** Make the edition that is on air right now again, from what is published now. */
  refreshRadioBulletin: async (): Promise<RadioRebuiltEdition | null> => {
    const response = await apiClient.post<{ bulletin: Partial<RadioRebuiltEdition> }>('/admin/radio/bulletin/refresh')
    const built = response.data.data?.bulletin
    if (!built) return null
    return {
      slotName: String(built.slotName || ''),
      occurrence: String(built.occurrence || ''),
      scriptSource: built.scriptSource === 'ai' ? 'ai' : 'desk',
      model: String(built.model || ''),
      note: String(built.note || ''),
      opening: String(built.opening || ''),
      closing: String(built.closing || ''),
      storyTitles: Array.isArray(built.storyTitles) ? built.storyTitles.map(String) : [],
    }
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

  broadcast: (payload: { title: string; body: string; url?: string; silent?: boolean; urgent?: boolean }) =>
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

  start: (payload: { title: string; description?: string; videoUrl?: string }) =>
    apiClient.post<{ live: Live }>('/live', payload),

  end: (id: string) =>
    apiClient.post<{ live: Live }>(`/live/${id}/end`),

  getComments: (id: string) =>
    apiClient.get<{ comments: LiveComment[] }>(`/live/${id}/comments`),
}

/** One programme in the radio timetable. */
export interface RadioSlot {
  _id: string
  name: string
  /** Wall-clock start the admin wrote, 24-hour "HH:mm", on the timetable's own clock. */
  at: string
  /** 0 = Sunday. Empty means every day. */
  days: number[]
  storyCount: number
  categories: string[]
  useAiScript: boolean
  enabled: boolean
}

export interface RadioEdition {
  _id: string
  opening: string
  closing: string
  /** Whether the words being read were written by the model or by the desk. */
  scriptSource: 'ai' | 'desk'
  model: string
  note: string
  startedAt: string
  occurrence: string
  stories: Article[]
}

/**
 * What the desk gets back after pressing "rebuild": the edition as the server made
 * it, with the headlines rather than whole stories, because the point is to check
 * the running order and who wrote the intro.
 */
export interface RadioRebuiltEdition {
  slotName: string
  occurrence: string
  scriptSource: 'ai' | 'desk'
  model: string
  note: string
  opening: string
  closing: string
  storyTitles: string[]
}

/** What is on air, what follows, and what this edition carries. */
export interface RadioTimetable {
  timezone: string
  now: string
  slots: RadioSlot[]
  current: RadioProgramme | null
  next: RadioProgramme | null
  bulletin?: RadioEdition
}

/** One occurrence of a programme: when it starts on the wall and as a real instant. */
export interface RadioProgramme {
  _id: string
  name: string
  at: string
  startsAt: string
  occurrence: string
}

/**
 * The radio reads its own timetable from the server.
 *
 * Nothing here is invented when a field is missing. A reader who is told "the
 * seven o'clock is on air" because the fetch returned a shape we did not expect is
 * being lied to about the station, so an unreadable answer comes back as "nothing
 * is scheduled" and the page says so.
 */
export const radioAPI = {
  getTimetable: async (): Promise<RadioTimetable> => {
    const response = await apiClient.get<Partial<RadioTimetable>>('/radio/timetable')
    const payload = response.data.data as Partial<RadioTimetable> | null
    const programme = (value: RadioProgramme | null | undefined): RadioProgramme | null =>
      value && typeof value.at === 'string' && typeof value.startsAt === 'string'
        ? { _id: String(value._id || ''), name: String(value.name || ''), at: value.at, startsAt: value.startsAt, occurrence: String(value.occurrence || '') }
        : null
    return {
      timezone: String(payload?.timezone || ''),
      now: String(payload?.now || ''),
      slots: Array.isArray(payload?.slots) ? payload.slots.map(knownSlot) : [],
      current: programme(payload?.current),
      next: programme(payload?.next),
      bulletin: normaliseEdition(payload?.bulletin) ?? undefined,
    }
  },
}

/**
 * What the admin portal gets back: the timetable it wrote, plus what is actually
 * on air under it. The second half is there so a person who has just typed in four
 * programme times can see the server agree, rather than trusting that "18:00" was
 * read as six in the evening in Kigali and not six in the evening somewhere else.
 */
export interface RadioScheduleResponse {
  timezone: string
  updatedAt?: string
  slots: RadioSlot[]
  now?: RadioTimetable | null
}

// Category ids arrive from Mongoose as strings, and a slot that never had any set
// is missing rather than empty; the editor wants one shape to render.
function knownSlot(value: unknown): RadioSlot {
  const slot = (value || {}) as Partial<RadioSlot>
  return {
    _id: String(slot._id || ''),
    name: String(slot.name || ''),
    at: String(slot.at || '12:00'),
    days: (Array.isArray(slot.days) ? slot.days : []).map(Number).filter(Number.isInteger),
    storyCount: Math.min(Math.max(Number(slot.storyCount) || 8, 1), 25),
    categories: (Array.isArray(slot.categories) ? slot.categories : []).map(String),
    useAiScript: slot.useAiScript !== false,
    enabled: slot.enabled !== false,
  }
}

function normaliseEdition(value: unknown): RadioEdition | null {
  if (!value) return null
  const edition = value as Partial<RadioEdition>
  if (typeof edition.opening !== 'string') return null
  return {
    _id: String(edition._id || ''),
    opening: edition.opening,
    closing: String(edition.closing || ''),
    scriptSource: edition.scriptSource === 'ai' ? 'ai' : 'desk',
    model: String(edition.model || ''),
    note: String(edition.note || ''),
    startedAt: String(edition.startedAt || ''),
    occurrence: String(edition.occurrence || ''),
    stories: Array.isArray(edition.stories) ? edition.stories : [],
  }
}

function normaliseSchedule(value: Partial<RadioScheduleResponse> | null): RadioScheduleResponse {
  return {
    timezone: String(value?.timezone || 'Africa/Kigali'),
    updatedAt: value?.updatedAt ? String(value.updatedAt) : undefined,
    slots: Array.isArray(value?.slots) ? value.slots.map(knownSlot) : [],
    now: normaliseTimetable(value?.now),
  }
}

function normaliseTimetable(value: unknown): RadioTimetable | null {
  if (!value) return null
  const timetable = value as Partial<RadioTimetable>
  const programme = (entry: RadioProgramme | null | undefined): RadioProgramme | null =>
    entry && typeof entry.at === 'string' && typeof entry.startsAt === 'string'
      ? { _id: String(entry._id || ''), name: String(entry.name || ''), at: entry.at, startsAt: entry.startsAt, occurrence: String(entry.occurrence || '') }
      : null
  return {
    timezone: String(timetable.timezone || ''),
    now: String(timetable.now || ''),
    slots: Array.isArray(timetable.slots) ? timetable.slots.map(knownSlot) : [],
    current: programme(timetable.current),
    next: programme(timetable.next),
    bulletin: normaliseEdition(timetable.bulletin) || undefined,
  }
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
/**
 * The scores page talks to RADAR and to nothing else.
 *
 * There is deliberately no sports-feed address anywhere in here. The backend
 * fetches ESPN once a minute for the days somebody is actually looking at, keeps
 * the answer in our own database, and hands the page what the database can
 * answer. That is what lets a crowd on one shared carrier address watch sixty
 * matches without any of them being rate-limited, and it is why every field on
 * the page has to survive being absent: a score this server could not read is
 * printed as nothing, never as a zero.
 */
export interface ScoreSide {
  id: string
  name: string
  short: string
  logo: string
  /** Empty for a fixture that has not kicked off, and for a number we never got. */
  score: string
  record: string
  form: string
  winner: boolean
  /** Only on a match: the squad, and the shape the manager picked. */
  players: ScorePlayer[]
  formation: string
}

export interface ScorePlayer {
  id: string
  name: string
  jersey: string
  position: string
  starter: boolean
}

export type ScoreEventKind = 'goal' | 'card' | 'substitution' | 'other'

export interface ScoreEvent {
  /** The source's own clock, "15'" or "45'+2". Blank means it printed none. */
  minute: string
  period: number
  kind: ScoreEventKind
  label: string
  text: string
  teamId: string
  teamName: string
  players: string[]
  scoringPlay: boolean
}

export interface ScoreStat {
  name: string
  label: string
  home: string
  away: string
  homeValue: number | null
  awayValue: number | null
}

export interface ScoreRow {
  id: string
  name: string
  shortName: string
  start: string | null
  state: 'pre' | 'in' | 'post'
  statusText: string
  clock: string
  period: number
  venue: string
  home: ScoreSide
  away: ScoreSide
}

export interface ScoreGroup {
  code: string
  name: string
  logo: string
  matches: ScoreRow[]
  fetchedAt: string | null
  stale: boolean
  /** The feed has not been read for this league yet; the rows below are old. */
  pending: boolean
  error: string | null
}

export interface Scoreboard {
  ok: boolean
  provider: string
  /** Our cache key for the day being shown, `YYYYMMDD`. */
  dateKey: string
  /** The day the server is on. A reader crossing midnight sees this move. */
  dayClock: string
  groups: ScoreGroup[]
  counts: { total: number; live: number; upcoming: number; finished: number }
  pendingLeagues: string[]
  errors: { code: string; reason: string }[]
  stale: boolean
  /** True while a league this page asked for is still being fetched. */
  refreshing: boolean
  /** The server's own advice on how soon to ask again: 30s with a match on. */
  pollSeconds: number
  refreshSeconds: number
  nextRefreshAt: string | null
}

export interface ScoreMatch {
  ok: boolean
  stale: boolean
  provider: string
  id: string
  code: string
  league: { name: string; logo: string }
  name: string
  start: string | null
  state: 'pre' | 'in' | 'post'
  statusText: string
  clock: string
  venue: string
  attendance: string
  home: ScoreSide
  away: ScoreSide
  events: ScoreEvent[]
  stats: ScoreStat[]
  possession: { label: string; home: string; away: string } | null
  fetchedAt: string | null
}

export interface StandingsRow {
  rank: number
  team: { id: string; name: string; short: string; logo: string }
  /** Null when the competition printed no figure - never shown as zero. */
  played: number | null
  win: number | null
  draw: number | null
  loss: number | null
  scored: number | null
  conceded: number | null
  difference: string
  points: string
  record: string
  /** A points take-off, written by the league rather than by us. */
  deductions: string
  note: string
  /** Which group this row belongs to, when the competition has groups. */
  table: string
}

export interface Standings {
  ok: boolean
  stale: boolean
  code: string
  league: { name: string; logo: string }
  season: string
  rows: StandingsRow[]
  fetchedAt: string | null
}

const figure = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

/**
 * A side, from whichever print of the match the server used.
 *
 * The scoreboard and the match page describe the same team with different
 * halves of the object - one has the form line, the other the squad - so both
 * are merged here rather than assumed, and a missing list stays an empty list.
 */
function normaliseSide(value: unknown): ScoreSide {
  const side = (value || {}) as Partial<ScoreSide> & { teamId?: string }
  return {
    id: text(side.id) || text(side.teamId),
    name: text(side.name),
    short: text(side.short),
    logo: text(side.logo),
    score: text(side.score),
    record: text(side.record),
    form: text(side.form),
    winner: side.winner === true,
    players: Array.isArray(side.players) ? side.players.map(normalisePlayer) : [],
    formation: text(side.formation),
  }
}

function normalisePlayer(value: unknown): ScorePlayer {
  const player = (value || {}) as Partial<ScorePlayer>
  return {
    id: text(player.id),
    name: text(player.name),
    jersey: text(player.jersey),
    position: text(player.position),
    starter: player.starter === true,
  }
}

const STATES = new Set(['pre', 'in', 'post'])

function normaliseState(value: unknown): 'pre' | 'in' | 'post' {
  const state = text(value)
  return STATES.has(state) ? (state as 'pre' | 'in' | 'post') : 'pre'
}

function normaliseRow(value: unknown): ScoreRow {
  const row = (value || {}) as Partial<ScoreRow>
  return {
    id: text(row.id),
    name: text(row.name),
    shortName: text(row.shortName),
    start: typeof row.start === 'string' || row.start === null ? text(row.start) || null : null,
    state: normaliseState(row.state),
    statusText: text(row.statusText),
    clock: text(row.clock),
    period: figure(row.period) ?? 0,
    venue: text(row.venue),
    home: normaliseSide(row.home),
    away: normaliseSide(row.away),
  }
}

/** A league the server could not name at all still gets its code, not a blank. */
function normaliseGroup(value: unknown): ScoreGroup {
  const group = (value || {}) as Partial<ScoreGroup>
  return {
    code: text(group.code),
    name: text(group.name) || text(group.code),
    logo: text(group.logo),
    matches: Array.isArray(group.matches) ? group.matches.map(normaliseRow) : [],
    fetchedAt: text(group.fetchedAt) || null,
    stale: group.stale === true,
    pending: group.pending === true,
    error: text(group.error) || null,
  }
}

const EVENT_KINDS = new Set(['goal', 'card', 'substitution', 'other'])

function normaliseEvent(value: unknown): ScoreEvent {
  const event = (value || {}) as Partial<ScoreEvent>
  const kind = text(event.kind)
  return {
    minute: text(event.minute),
    period: figure(event.period) ?? 0,
    kind: EVENT_KINDS.has(kind) ? (kind as ScoreEventKind) : 'other',
    label: text(event.label),
    text: text(event.text),
    teamId: text(event.teamId),
    teamName: text(event.teamName),
    players: Array.isArray(event.players) ? event.players.map(text).filter(Boolean) : [],
    scoringPlay: event.scoringPlay === true,
  }
}

// Our server passes a competition's ratio statistics through exactly as they are
// published, and the feed writes them as fractions of one while naming them with
// a percent sign. Left alone, a side that completed four passes in five reads
// "0.8 PASS COMPLETION %" on the page, so a fraction is turned back into the
// percentage its own label promises. A figure the source already scaled -
// possession arrives as 55.9 - is bigger than one and is left untouched.
function asPercentage(label: string, value: number | null): number | null {
  if (value === null || value > 1 || !/%|pct|percent/i.test(label)) return value
  return Math.round(value * 1000) / 10
}

function normaliseStat(value: unknown): ScoreStat {
  const stat = (value || {}) as Partial<ScoreStat>
  const named = `${text(stat.label)} ${text(stat.name)}`
  const homeValue = asPercentage(named, figure(stat.homeValue))
  const awayValue = asPercentage(named, figure(stat.awayValue))
  return {
    name: text(stat.name),
    label: text(stat.label),
    home: homeValue === null ? text(stat.home) : String(homeValue),
    away: awayValue === null ? text(stat.away) : String(awayValue),
    homeValue,
    awayValue,
  }
}

function normaliseStandingsRow(value: unknown): StandingsRow {
  const row = (value || {}) as Partial<StandingsRow>
  const team = (row.team || {}) as Partial<StandingsRow['team']>
  return {
    rank: figure(row.rank) ?? 0,
    team: { id: text(team.id), name: text(team.name), short: text(team.short), logo: text(team.logo) },
    played: figure(row.played),
    win: figure(row.win),
    draw: figure(row.draw),
    loss: figure(row.loss),
    scored: figure(row.scored),
    conceded: figure(row.conceded),
    difference: text(row.difference),
    points: text(row.points),
    record: text(row.record),
    deductions: text(row.deductions),
    note: text(row.note),
    table: text(row.table),
  }
}

export const scoresAPI = {
  /** What the page offers to follow, with what is known about today. */
  leagues: async (): Promise<{ leagues: { code: string; name: string; logo: string; matches: number; live: number }[]; refreshSeconds: number }> => {
    const response = await apiClient.get('/scores/leagues')
    const payload = (response.data?.data || {}) as Record<string, unknown>
    const list = Array.isArray(payload.leagues) ? payload.leagues : []
    return {
      leagues: list.map((item) => {
        const league = (item || {}) as Record<string, unknown>
        return {
          code: text(league.code),
          name: text(league.name) || text(league.code),
          logo: text(league.logo),
          matches: figure(league.matches) ?? 0,
          live: figure(league.live) ?? 0,
        }
      }),
      refreshSeconds: figure(payload.refreshSeconds) ?? 60,
    }
  },

  /** One day, grouped. The only call the page makes to stay current. */
  scoreboard: async ({ date, league, live }: { date?: string; league?: string; live?: boolean } = {}): Promise<Scoreboard> => {
    const response = await apiClient.get('/scores/scoreboard', {
      ...(date ? { date } : {}), ...(league ? { league } : {}), ...(live ? { live: 1 } : {}),
    })
    const payload = (response.data?.data || {}) as Record<string, unknown>
    const counts = (payload.counts || {}) as Record<string, unknown>
    const groups = Array.isArray(payload.leagues) ? payload.leagues.map(normaliseGroup) : []
    const poll = figure(payload.pollSeconds)
    return {
      ok: payload.ok !== false,
      provider: text(payload.provider),
      dateKey: text(payload.dateKey),
      dayClock: text(payload.dayClock),
      groups,
      counts: {
        total: figure(counts.total) ?? groups.reduce((n, group) => n + group.matches.length, 0),
        live: figure(counts.live) ?? 0,
        upcoming: figure(counts.upcoming) ?? 0,
        finished: figure(counts.finished) ?? 0,
      },
      pendingLeagues: Array.isArray(payload.pendingLeagues) ? payload.pendingLeagues.map(text).filter(Boolean) : [],
      errors: Array.isArray(payload.errors)
        ? payload.errors.map((item) => {
            const error = (item || {}) as Record<string, unknown>
            return { code: text(error.code), reason: text(error.reason) }
          })
        : [],
      stale: payload.stale === true,
      refreshing: payload.refreshing === true,
      // Never faster than the server is willing to answer, and never slower than
      // a minute when it says zero: a page that stops asking is a page that stops
      // being live.
      pollSeconds: Math.min(Math.max(poll ?? 30, 15), 300),
      refreshSeconds: figure(payload.refreshSeconds) ?? 60,
      nextRefreshAt: text(payload.nextRefreshAt) || null,
    }
  },

  /** One match: what happened, who played, what the two sides did with the ball. */
  match: async (id: string, league?: string): Promise<ScoreMatch> => {
    const response = await apiClient.get(`/scores/match/${encodeURIComponent(id)}`, league ? { league } : undefined)
    const payload = (response.data?.data || {}) as Record<string, unknown>
    const leagueObject = (payload.league || {}) as Record<string, unknown>
    const possession = (payload.possession || null) as Record<string, unknown> | null
    return {
      ok: payload.ok !== false,
      stale: payload.stale === true,
      provider: text(payload.provider),
      id: text(payload.id) || id,
      code: text(payload.code),
      league: { name: text(leagueObject.name), logo: text(leagueObject.logo) },
      name: text(payload.name),
      start: text(payload.start) || null,
      state: normaliseState(payload.state),
      statusText: text(payload.statusText),
      clock: text(payload.clock),
      venue: text(payload.venue),
      attendance: text(payload.attendance),
      home: normaliseSide(payload.home),
      away: normaliseSide(payload.away),
      events: Array.isArray(payload.events) ? payload.events.map(normaliseEvent) : [],
      stats: Array.isArray(payload.stats) ? payload.stats.map(normaliseStat) : [],
      possession: possession
        ? { label: text(possession.label) || 'Possession', home: text(possession.home), away: text(possession.away) }
        : null,
      fetchedAt: text(payload.fetchedAt) || null,
    }
  },

  /** The table, in the order the competition published it. */
  standings: async (league: string): Promise<Standings> => {
    const response = await apiClient.get('/scores/standings', { league })
    const payload = (response.data?.data || {}) as Record<string, unknown>
    const leagueObject = (payload.league || {}) as Record<string, unknown>
    return {
      ok: payload.ok !== false,
      stale: payload.stale === true,
      code: text(payload.code) || league,
      league: { name: text(leagueObject.name), logo: text(leagueObject.logo) },
      season: text(payload.season),
      rows: Array.isArray(payload.entries) ? payload.entries.map(normaliseStandingsRow) : [],
      fetchedAt: text(payload.fetchedAt) || null,
    }
  },
}

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