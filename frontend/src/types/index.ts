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

/**
 * One thing the story is standing on. An author writes their own sources; only
 * the desk can move `verificationStatus` off `pending`, and the reader sees the
 * status but never the staffer's note or name.
 */
export interface ArticleSource {
  _id?: string
  title?: string
  organization?: string
  url?: string
  type?: 'link' | 'document' | 'interview' | 'official-data' | 'observation'
  quote?: string
  accessedAt?: string
  verificationStatus?: 'pending' | 'verified' | 'rejected'
  addedBy?: string
  at?: string
  /** Desk-only: present when the review desk asked for the story. */
  reviewedBy?: string | { _id: string; fullName?: string; role?: string }
  reviewNote?: string
}

/**
 * Desk-only: the copy as it was before somebody rewrote it. A story never shows
 * these next to its live text.
 */
export interface ArticleRevision {
  title?: string
  summary?: string
  content?: string
  note?: string
  at?: string
  by?: string | { _id: string; fullName?: string; username?: string; role?: string } | null
}

/**
 * A picture or a clip after the one at the top of the story. The author's list,
 * in their order, each with what it shows and whose it is.
 */
export interface StoryMedia {
  _id?: string
  kind: 'image' | 'video'
  /** What the author pasted or uploaded. Shown to them, never trusted as loadable. */
  url: string
  source?: 'youtube' | 'vimeo' | 'facebook' | 'instagram' | 'tiktok' | 'file' | 'link' | ''
  /** What the reader's page is allowed to load, written by the server. */
  embedUrl?: string
  caption?: string
  credit?: string
}

export interface Article {
  _id: string
  title: string
  slug: string
  summary: string
  /** Search-result description. Optional: pages fall back to the summary. */
  metaDescription?: string
  content: string
  featuredImage?: string
  /** Who took the picture, and where it came from. Printed under the image. */
  imageCredit?: string
  imageSourceUrl?: string
  /** What the photograph shows, in the newsroom's words. Printed with the credit. */
  imageCaption?: string
  /**
   * The clip attached to the story. `videoUrl` is what the author pasted or
   * uploaded; the server classifies it and stores the address the reader's page
   * may load in `videoEmbedUrl`, so the embed is never the typed text itself.
   */
  videoUrl?: string
  videoSource?: 'youtube' | 'vimeo' | 'facebook' | 'instagram' | 'tiktok' | 'file' | 'link' | ''
  videoEmbedUrl?: string
  /** The extra pictures and clips, in the order the author put them. */
  media?: StoryMedia[]
  /**
   * Paid content. Only an editor or an admin can set it, and a story that says
   * it is sponsored has to say who paid.
   */
  isSponsored?: boolean
  sponsor?: string
  /**
   * What the newsroom got wrong and said so, oldest first. Appended by staff
   * and rendered on the story; a correction is never edited over.
   */
  corrections?: { note: string; at: string; by?: string }[]
  /**
   * What the story is standing on. Readers see the list and each status; the
   * desk's note and the staffer who ruled are not sent to anybody else.
   */
  sources?: ArticleSource[]
  /** Desk-only, and `select: false` on the model: an earlier version of the copy. */
  revisions?: ArticleRevision[]
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
  /**
   * Set on a public read when the reader asked for another language: what the
   * story is being shown in, and whether the translator actually served it.
   * Absent means the English original is what is on screen.
   */
  translation?: { lang: string; translated: boolean }
  /** Only the admin portal produces these, and readers must see the label. */
  aiGenerated?: boolean
  /**
   * The desk's judgement that this story is worth a reader's attention now.
   * Never set by the author, capped at a few at a time, and only meaningful
   * next to `breakingAt` - see utils/breakingStory for the clock.
   */
  isBreaking?: boolean
  breakingAt?: string
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
  article?: string
  user: string | { _id: string; fullName: string; username?: string; avatar?: string }
  content: string
  status: 'active' | 'hidden' | 'reported' | 'deleted'
  // Whether the reader who asked for this list flagged the comment. Who flagged
  // it is never sent to anybody else, so this is the only report a reader sees.
  reported?: boolean
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
  relatedEntity?: string | Article
  relatedModel?: string
  createdAt: string
}

export interface Live {
  _id: string
  title: string
  description?: string
  host: string | User
  status: 'active' | 'ended'
  startedAt: string
  endedAt?: string | null
  views: number
  viewers: number
  peakViewers: number
  // 'camera' is carried peer-to-peer from the host's browser; the other three are
  // a link the admin put on air, which the page embeds instead of dialling.
  source?: 'camera' | 'youtube' | 'vimeo' | 'facebook' | 'instagram' | 'tiktok' | 'file'
  videoUrl?: string
  watchUrl?: string
  embedUrl?: string
  sharePath?: string
}

export interface LiveComment {
  _id: string
  live: string
  user: string
  name: string
  text: string
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