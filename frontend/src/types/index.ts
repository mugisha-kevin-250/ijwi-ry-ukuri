export interface User {
  _id: string
  fullName: string
  username: string
  email: string
  role: 'READER' | 'WRITER' | 'EDITOR' | 'ADMIN'
  isActive: boolean
  avatar?: string
  country?: string
  language?: string
  bio?: string
  writerStatus?: 'pending' | 'approved' | 'rejected' | 'suspended'
  writerProfile?: string
  createdAt: string
  updatedAt: string
}

export interface Category {
  _id: string
  name: string
  slug: string
  description?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface Article {
  _id: string
  title: string
  slug: string
  summary: string
  content: string
  featuredImage?: string
  author: string | { _id: string; fullName: string; username: string; avatar?: string; bio?: string }
  category: string | { _id: string; name: string; slug: string }
  tags: string[]
  status: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'published' | 'archived'
  views: number
  validViews: number
  uniqueViews: number
  likes: number
  commentsCount: number
  readingTime: number
  language?: string
  country?: string
  publishedAt?: string
  createdAt: string
  updatedAt: string
  liked?: boolean
  bookmarked?: boolean
  followingAuthor?: boolean
}

export interface Comment {
  _id: string
  article: string
  user: string | { _id: string; fullName: string; username: string; avatar?: string }
  content: string
  status: 'active' | 'hidden' | 'reported' | 'deleted'
  createdAt: string
  updatedAt: string
}

export interface Like {
  _id: string
  article: string
  user: string
  createdAt: string
}

export interface Bookmark {
  _id: string
  article: string | Article
  user: string
  createdAt: string
}

export interface Follow {
  _id: string
  follower: string
  writer: string | WriterProfile
  createdAt: string
}

export interface WriterProfile {
  _id: string
  user: string
  fullName: string
  username: string
  bio: string
  profileImage?: string
  country?: string
  language?: string
  reasonForWriting?: string
  status: 'pending' | 'approved' | 'rejected' | 'suspended'
  totalArticles: number
  totalValidViews: number
  createdAt: string
  updatedAt: string
}

export interface Notification {
  _id: string
  user: string
  type: string
  message: string
  isRead: boolean
  relatedEntity?: string
  relatedModel?: string
  createdAt: string
}

export interface WriterEarning {
  _id: string
  writerId: string
  weekStart: string
  weekEnd: string
  validViews: number
  rewardRate: number
  calculatedAmount: number
  approvedAmount: number
  status: 'pending' | 'under_review' | 'approved' | 'rejected' | 'paid'
  createdAt: string
  approvedAt?: string
  paidAt?: string
}

export interface Payout {
  _id: string
  writerId: string
  earningId: string
  amount: number
  currency: string
  status: 'pending' | 'approved' | 'rejected' | 'paid'
  paymentMethod: string
  paymentReference?: string
  requestedAt: string
  approvedAt?: string
  paidAt?: string
  rejectionReason?: string
}

export interface PlatformSetting {
  _id: string
  key: string
  value: any
  description?: string
  updatedAt: string
}

export interface Report {
  _id: string
  article: string
  reporter: string
  reason: 'misinformation' | 'spam' | 'inappropriate content' | 'copyright issue' | 'other'
  details?: string
  status: 'open' | 'reviewed' | 'resolved'
  createdAt: string
  updatedAt: string
}

export interface ApiResponse<T = any> {
  success: boolean
  message: string
  data: T
}

export interface PaginatedResponse<T> {
  success: boolean
  message: string
  data: {
    articles: T[]
    total: number
    page: number
    limit: number
  }
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  fullName: string
  username: string
  email: string
  password: string
  country?: string
  language?: string
}

export interface AuthResponse {
  user: User
  token: string
}

export interface CreateArticleRequest {
  title: string
  summary: string
  content: string
  category: string
  tags?: string[]
  featuredImage?: string
}

export interface UpdateArticleRequest {
  title?: string
  summary?: string
  content?: string
  category?: string
  tags?: string[]
  featuredImage?: string
}

export interface WriterApplicationRequest {
  fullName?: string
  username?: string
  bio?: string
  profileImage?: string
  country?: string
  language?: string
  reasonForWriting?: string
}

export interface CommentRequest {
  content: string
}

export interface ReportRequest {
  reason: string
  details?: string
}

export interface ViewRequest {
  readingDurationMs?: number
  anonymousSessionId?: string
}

export interface DashboardStats {
  totalArticles: number
  publishedArticles: number
  pendingArticles: number
  totalValidViews: number
  viewsThisWeek: number
  currentEarnings: number
  previousWeeklyEarnings: number
  topPerformingArticle: Article | null
}

export interface AdminDashboardStats {
  totalUsers: number
  totalReaders: number
  totalWriters: number
  totalEditors: number
  publishedArticles: number
  pendingArticles: number
  rejectedArticles: number
  totalViews: number
  validViews: number
  viewsThisWeek: number
  viewsThisMonth: number
  topArticles: Article[]
  topWriters: any[]
  pendingEarnings: number
  pendingPayouts: number
  totalPaidAmount: number
}

export interface NavItem {
  label: string
  href: string
  icon?: React.ComponentType<{ className?: string }>
  roles?: ('READER' | 'WRITER' | 'EDITOR' | 'ADMIN')[]
  children?: NavItem[]
}