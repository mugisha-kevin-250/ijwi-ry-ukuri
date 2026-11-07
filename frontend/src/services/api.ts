import { apiClient } from './apiClient'
import type { AdminDashboardStats, Article, AuthResponse, Category, Comment, DashboardStats, User } from '../types'

interface ArticleQuery {
  page?: number
  limit?: number
  search?: string
  category?: string
  tag?: string
  sort?: string
}

interface ArticleResults {
  articles: Article[]
  total: number
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

  search: (query: string, page?: number, limit?: number) =>
    apiClient.get<any>('/search', { search: query, page, limit }),

  getWriter: (id: string) =>
    apiClient.get(`/writers/${id}`),
}

export const writerAPI = {
  apply: (data: any) =>
    apiClient.post('/writers/apply', data),

  createArticle: (data: any) =>
    apiClient.post('/writers/articles', data),

  getMyArticles: () =>
    apiClient.get<Article[] | ArticleResults>('/writers/articles'),

  getArticle: (id: string) =>
    apiClient.get(`/writers/articles/${id}`),

  updateArticle: (id: string, data: any) =>
    apiClient.put(`/writers/articles/${id}`, data),

  deleteArticle: (id: string) =>
    apiClient.delete(`/writers/articles/${id}`),

  publishArticle: (id: string) =>
    apiClient.post(`/writers/articles/${id}/publish`),

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
    apiClient.get<Comment[]>(`/articles/${id}/comments`),

  addComment: (id: string, data: { content: string }) =>
    apiClient.post<Comment>(`/articles/${id}/comments`, data),

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

export const editorAPI = {
  getPendingArticles: () =>
    apiClient.get('/editor/articles/pending'),

  approveArticle: (id: string) =>
    apiClient.put(`/editor/articles/${id}/approve`),

  rejectArticle: (id: string) =>
    apiClient.put(`/editor/articles/${id}/reject`),

  requestCorrection: (id: string) =>
    apiClient.put(`/editor/articles/${id}/request-correction`),

  publishArticle: (id: string) =>
    apiClient.put(`/editor/articles/${id}/publish`),

  unpublishArticle: (id: string) =>
    apiClient.put(`/editor/articles/${id}/unpublish`),
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

  getArticles: async (params?: { page?: number; limit?: number; status?: string; category?: string; search?: string; sort?: string }) => {
    const response = await apiClient.get('/admin/articles', params)
    return toPaged<Article>(response.data.data, 'articles')
  },

  updateArticleStatus: (id: string, status: string) =>
    apiClient.put(`/admin/articles/${id}/status`, { status }),

  deleteArticle: (id: string) =>
    apiClient.delete(`/admin/articles/${id}`),
}

export const pushAPI = {
  getStatus: () =>
    apiClient.get<{ enabled: boolean }>('/push/status'),

  getSubscribers: () =>
    apiClient.get<{ count: number; enabled: boolean }>('/push/subscriptions'),

  broadcast: (payload: { title: string; body: string; url?: string }) =>
    apiClient.post<{ sent: number; failed: number; expired: number; total: number }>('/push/broadcast', payload),
}