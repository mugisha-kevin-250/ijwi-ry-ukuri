import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { formatDistanceToNow, format } from 'date-fns'
import { Calendar, ChevronRight, Clock, Eye, Heart, MessageSquare, Bookmark, Share2, Sparkles, Loader2, UserPlus } from 'lucide-react'
import type { Article, Comment } from '../../types'
import { publicAPI, articleAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../context/I18nContext'
import ArticleList from '../../components/news/ArticleList'
import { LoadingCard, LoadingGrid } from '../../components/common/Loading'
import EmptyState from '../../components/common/EmptyState'
import Avatar from '../../components/common/Avatar'
import MediaImage from '../../components/common/MediaImage'
import AdSlot from '../../components/ads/AdSlot'
import { cn } from '../../utils/cn'
import { useSeo, absoluteSiteUrl } from '../../utils/useSeo'
import { sanitizeHtml } from '../../utils/sanitizeHtml'
import { requestSignIn } from '../../utils/signInPrompt'
import { useArticleViewTracking } from '../../utils/viewTracking'
import { useArticleBookmark, useArticleLike, useAuthorFollow, useVisiblePoll } from '../../utils/engagementStore'
import { shareArticle } from '../../utils/shareArticle'
import { categoryGroupSlug, categoryHref, categoryLabel } from '../../data/categoryVisuals'

/** article.category arrives populated or as a bare id, depending on the route. */
function storyCategory(article: Article | null) {
  if (!article) return null
  return typeof article.category === 'object' && article.category !== null ? article.category : null
}

// Stories are typed as plain text in a textarea, so every line break the writer
// made is a paragraph; only the older records that carry markup go through as HTML.
const HTML_MARKUP = /<\/?(p|h[1-6]|ul|ol|li|blockquote|figure|figcaption|img|a|em|strong|b|i|br|div|span)\b/i

function looksLikeHtml(content: string) {
  return HTML_MARKUP.test(content || '')
}

function splitParagraphs(content: string) {
  return String(content || '')
    .split(/\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
}

export default function ArticleDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t } = useI18n()
  const [article, setArticle] = useState<Article | null>(null)
  const [relatedArticles, setRelatedArticles] = useState<Article[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { liked, likes, toggle: toggleLike } = useArticleLike(article)
  const { bookmarked, toggle: toggleBookmark } = useArticleBookmark(article)
  const followAuthorId = article && typeof article.author === 'object' ? article.author._id : null
  const { following, toggle: toggleFollow } = useAuthorFollow(followAuthorId, article?.followingAuthor)

  const seoCategory = storyCategory(article)

  useSeo({
    title: article?.title,
    description: article?.metaDescription || article?.summary,
    path: slug ? `/article/${slug}` : undefined,
    image: article?.featuredImage,
    type: 'article',
    jsonLd: article
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'NewsArticle',
            headline: article.title,
            description: article.summary,
            image: article.featuredImage ? [article.featuredImage] : undefined,
            datePublished: article.publishedAt ?? article.createdAt,
            dateModified: article.updatedAt ?? article.createdAt,
            inLanguage: article.language ?? 'rw',
            author: { '@type': 'Person', name: typeof article.author === 'object' ? article.author.fullName : '' },
            publisher: { '@type': 'Organization', name: "RADAR" },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { name: t('nav.home'), item: absoluteSiteUrl('/') },
              { name: t('articles.title'), item: absoluteSiteUrl('/articles') },
              ...(seoCategory
                ? [{ name: categoryLabel(seoCategory, t), item: absoluteSiteUrl(categoryHref(seoCategory)) }]
                : []),
              { name: article.title, item: absoluteSiteUrl(`/article/${slug}`) },
            ].map((crumb, index) => ({ '@type': 'ListItem', position: index + 1, ...crumb })),
          },
        ]
      : undefined,
  })

  useEffect(() => {
    const fetchArticle = async () => {
      if (!slug) return
      try {
        const [articleRes, relatedRes] = await Promise.all([
          publicAPI.getArticleBySlug(slug),
          publicAPI.getArticles({ page: 1, limit: 24 }),
        ])
        const payload = articleRes.data.data as any
        const articleData = (payload?.article ?? payload) as Article | null
        if (!articleData) {
          navigate('/articles')
          return
        }
        setArticle(articleData)
        // Stories from the same section first, then whatever else is newest, so
        // the sidebar reads as a follow-up to what the reader just finished.
        const pool = (relatedRes.data.data?.articles as Article[] | undefined)?.filter((a) => a._id !== articleData._id) || []
        const section = categoryGroupSlug(storyCategory(articleData))
        const sameSection = pool.filter((a) => categoryGroupSlug(storyCategory(a)) === section)
        setRelatedArticles([...sameSection, ...pool.filter((a) => !sameSection.includes(a))].slice(0, 4))
      } catch (error) {
        console.error('Failed to fetch article:', error)
        navigate('/articles')
      } finally {
        setIsLoading(false)
      }
    }
    fetchArticle()
  }, [slug, navigate, user])

  useArticleViewTracking(article?._id)

  // Keeps an open story current: another reader's like or a fresh view count
  // arrives without a manual reload.
  const refreshArticle = useCallback(async () => {
    if (!slug) return
    try {
      const response = await publicAPI.getArticleBySlug(slug)
      const payload = response.data.data as any
      const fresh = (payload?.article ?? payload) as Article | null
      if (fresh) setArticle(fresh)
    } catch {
      // Leave what is on screen if the API is briefly unavailable.
    }
  }, [slug])

  useVisiblePoll(refreshArticle)

  // The estimate is only worth showing if it moves: count the story down as the
  // reader scrolls instead of repeating the number the story opened with.
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null)

  useEffect(() => {
    const readingTime = Number(article?.readingTime || 0)
    if (!readingTime) return

    const update = () => {
      const element = contentRef.current
      if (!element) return
      const scrollable = element.offsetHeight - window.innerHeight
      const scrolled = Math.min(Math.max(-element.getBoundingClientRect().top, 0), Math.max(scrollable, 0))
      const progress = scrollable > 0 ? scrolled / scrollable : 0
      setMinutesLeft(Math.max(1, Math.ceil(readingTime * (1 - progress))))
    }

    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [article?.readingTime, article?._id])

  const handleLike = () => void toggleLike()

  const handleBookmark = () => void toggleBookmark()

  const handleShare = async () => {
    if (!article) return
    await shareArticle({
      url: window.location.href,
      title: article.title,
      text: article.summary,
      copiedLabel: t('articles.linkCopied'),
    })
  }

  const handleFollow = () => void toggleFollow()

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-8">
        <LoadingCard className="max-w-4xl" />
        <LoadingCard className="max-w-4xl" />
        <LoadingGrid count={3} />
      </div>
    )
  }

  if (!article) {
    return (
      <div className="max-w-4xl mx-auto text-center py-16">
        <EmptyState
          icon={<Loader2 className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />}
          title={t('articles.notFound')}
          description={t('articles.notFoundDesc')}
          action={<Link to="/articles" className="text-brand-600 hover:underline">{t('articles.browse')}</Link>}
        />
      </div>
    )
  }

  const author = typeof article.author === 'object' ? article.author : null
  const category = typeof article.category === 'object' ? article.category : null
  const readingTime = Number(article.readingTime || 1)
  const publishedDate = article.publishedAt || article.createdAt
  // Only worth a second line when the story really changed after it went out.
  const storyUpdated = Boolean(
    article.updatedAt &&
    publishedDate &&
    new Date(article.updatedAt).getTime() - new Date(publishedDate).getTime() > 24 * 60 * 60 * 1000,
  )

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return t('articles.unknownDate')
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return t('articles.unknownDate')
    return format(d, 'MMMM d, yyyy')
  }

  const formatRelative = (dateStr: string | undefined) => {
    if (!dateStr) return t('articles.unknownDate')
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return t('articles.unknownDate')
    return formatDistanceToNow(d, { addSuffix: true })
  }

  return (
    <div className="mx-auto max-w-4xl lg:grid lg:max-w-6xl lg:grid-cols-[minmax(0,270px)_minmax(0,1fr)] lg:items-start lg:gap-10">
      <article className="space-y-8 lg:col-start-2 lg:row-start-1">
      <nav aria-label={t('articles.breadcrumb')} className="text-sm text-gray-500 dark:text-gray-400">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link to="/" className="transition-colors hover:text-brand-600 dark:hover:text-brand-400">{t('nav.home')}</Link>
          </li>
          <li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5" /></li>
          <li>
            <Link to="/articles" className="transition-colors hover:text-brand-600 dark:hover:text-brand-400">{t('articles.title')}</Link>
          </li>
          {category && (
            <>
              <li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5" /></li>
              <li>
                <Link to={categoryHref(category)} className="transition-colors hover:text-brand-600 dark:hover:text-brand-400">
                  {categoryLabel(category, t)}
                </Link>
              </li>
            </>
          )}
          <li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5" /></li>
          <li aria-current="page" className="max-w-[34ch] truncate font-medium text-gray-900 dark:text-white">{article.title}</li>
        </ol>
      </nav>

      <header className="space-y-4">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white leading-tight">{article.title}</h1>
        {article.aiGenerated && (
          <p className="inline-flex items-center gap-1.5 rounded-md bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 dark:bg-violet-900/40 dark:text-violet-200">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {t('articles.aiLabel')}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
          {author && (
            <Link
              to={`/user/${author._id}`}
              className="flex items-center gap-2 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
            >
              <Avatar
                src={author.avatar}
                name={author.fullName}
                className="h-8 w-8 bg-brand-100 dark:bg-brand-900"
                textClassName="text-sm font-medium text-brand-600 dark:text-brand-400"
              />
              <span className="font-medium text-gray-900 dark:text-white">{author.fullName}</span>
            </Link>
          )}
          <span className="flex items-center gap-1">
            <Calendar className="h-4 w-4" aria-hidden="true" />
            <time dateTime={publishedDate}>
              {publishedDate ? formatDate(publishedDate) : formatRelative(article.createdAt)}
            </time>
          </span>
          {storyUpdated && (
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" aria-hidden="true" />
              {t('articles.updated')} {formatDate(article.updatedAt)}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Eye className="h-4 w-4" aria-hidden="true" />
            {(article.views || 0).toLocaleString()} {t('articles.views')}
          </span>
          <span className="flex items-center gap-1">
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            {(article.commentsCount || 0).toLocaleString()} {t('articles.comments')}
          </span>
        </div>
      </header>

      {article.featuredImage && (
        <div className="relative aspect-video rounded-xl overflow-hidden">
          <MediaImage
            src={article.featuredImage}
            alt={article.title}
            className="h-full w-full object-cover"
          />
        </div>
      )}

      <div className="space-y-7">
        <p className="max-w-[42rem] text-lg sm:text-xl leading-relaxed font-medium text-gray-700 dark:text-gray-300">
          {article.summary}
        </p>
        <div ref={contentRef} className="prose-content">
          {looksLikeHtml(article.content) ? (
            <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(article.content) }} />
          ) : (
            splitParagraphs(article.content).map((block, index) => <p key={index}>{block}</p>)
          )}
        </div>
      </div>

      {/* The reader has finished the story, so this is where an in-content unit
          earns its keep without cutting into the read. */}
      <AdSlot name="articleInline" />

      {article.tags && article.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-6 border-t border-gray-200 dark:border-gray-800">
          <span className="text-sm text-gray-500 dark:text-gray-400">{t('articles.tags')}:</span>
          {article.tags.map((tag) => (
            <Link
              key={tag}
              to={`/search?tag=${encodeURIComponent(tag)}`}
              className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 hover:bg-brand-100 hover:text-brand-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-brand-900 dark:hover:text-brand-300 transition-colors"
            >
              {tag}
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 pt-6 border-t border-gray-200 dark:border-gray-800">
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          <button
            onClick={handleLike}
            className={cn(
              'inline-flex items-center gap-2 px-5 py-3 rounded-lg text-base font-medium transition-colors',
              liked
                ? 'bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            )}
            aria-pressed={liked}
          >
            <Heart className={cn('h-5 w-5', liked && 'fill-current')} aria-hidden="true" />
            <span>{likes.toLocaleString()}</span>
          </button>
          <button
            onClick={handleBookmark}
            className={cn(
              'inline-flex items-center gap-2 px-5 py-3 rounded-lg text-base font-medium transition-colors',
              bookmarked
                ? 'bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            )}
            aria-pressed={bookmarked}
          >
            <Bookmark className={cn('h-5 w-5', bookmarked && 'fill-current')} aria-hidden="true" />
            <span>{t('articles.save')}</span>
          </button>
          <button
            onClick={handleShare}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-lg text-base font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
          >
            <Share2 className="h-5 w-5" aria-hidden="true" />
            <span>{t('articles.share')}</span>
          </button>
        </div>
        <div className="text-base text-gray-500 dark:text-gray-400">
          {minutesLeft === null || minutesLeft >= readingTime
            ? `${readingTime} ${t('articles.minRead')}`
            : `${minutesLeft} ${t('articles.minutesLeft')}`}
        </div>
      </div>

      {author && (
        <div className="flex gap-4 p-6 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <Link to={`/user/${author._id}`} className="flex-shrink-0">
            <Avatar
              src={author.avatar}
              name={author.fullName}
              className="h-16 w-16 bg-brand-100 dark:bg-brand-900"
              textClassName="text-2xl font-bold text-brand-600 dark:text-brand-400"
            />
          </Link>
          <div className="flex-1">
            <Link to={`/user/${author._id}`} className="font-semibold text-gray-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400 transition-colors">
              {author.fullName}
            </Link>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">@ {author.username}</p>
            {author.bio && <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 line-clamp-2">{author.bio}</p>}
            <button
              onClick={handleFollow}
              aria-pressed={following}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2 mt-3 rounded-lg font-medium transition-colors',
                following
                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-brand-900 dark:text-brand-300'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              )}
            >
              <UserPlus className="h-4 w-4" />
              {following ? t('articles.following') : t('articles.follow')}
            </button>
          </div>
        </div>
      )}

      <section translate="no" className="space-y-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('articles.comments')}</h2>
        <CommentsSection articleId={article._id} />
      </section>
      </article>

      {/* On a big screen the follow-up stories sit beside the text; on a phone
          they land under the comments once the reader is done. */}
      {relatedArticles.length > 0 && (
        <aside className="mt-10 space-y-4 lg:col-start-1 lg:row-start-1 lg:mt-0">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('articles.related')}</h2>
          <ArticleList articles={relatedArticles} variant="list" />
          <AdSlot name="articleSidebar" className="pt-2" />
        </aside>
      )}
    </div>
  )
}

function CommentsSection({ articleId }: { articleId: string }) {
  const { user } = useAuth()
  const { t } = useI18n()
  const [comments, setComments] = useState<Comment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const fetchComments = async () => {
      try {
        const response = await articleAPI.getComments(articleId)
        setComments((response.data.data as any)?.comments || [])
      } catch (error) {
        console.error('Failed to fetch comments:', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchComments()
  }, [articleId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) {
      requestSignIn()
      return
    }
    if (!newComment.trim()) return

    setIsSubmitting(true)
    try {
      const response = await articleAPI.addComment(articleId, { content: newComment })
      const created = (response.data.data as any)?.comment
      // The API returns the bare comment, so the author still needs to be filled in locally.
      if (created) setComments(prev => [{ ...created, user: { _id: user._id, fullName: user.fullName, avatar: user.avatar } }, ...prev])
      setNewComment('')
    } catch (error) {
      console.error('Failed to add comment:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {user ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder={t('articles.commentPlaceholder')}
            className="w-full min-h-[100px] p-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white resize-none"
            rows={3}
          />
          <button
            type="submit"
            disabled={!newComment.trim() || isSubmitting}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? t('articles.posting') : t('articles.postComment')}
          </button>
        </form>
      ) : (
        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
          <p className="text-gray-600 dark:text-gray-400">
            <Link to="/login" className="text-brand-600 dark:text-brand-400 hover:underline font-medium">{t('nav.login')}</Link> {t('articles.toComment')}
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <LoadingCard key={i} />
          ))}
        </div>
      ) : comments.length === 0 ? (
        <p className="text-center text-gray-500 dark:text-gray-400 py-8">{t('articles.noComments')}</p>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <CommentItem key={comment._id} comment={comment} />
          ))}
        </div>
      )}
    </div>
  )
}

function CommentItem({ comment }: { comment: Comment }) {
  const user = typeof comment.user === 'object' ? comment.user : null
  return (
    <div className="flex gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <Avatar
        src={user?.avatar}
        name={user?.fullName}
        className="h-10 w-10 flex-shrink-0 bg-brand-100 dark:bg-brand-900"
        textClassName="text-sm font-medium text-brand-600 dark:text-brand-400"
      />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <Link
            to={user ? `/user/${user._id}` : '#'}
            className="font-medium text-gray-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400"
          >
            {user?.fullName || 'Unknown'}
          </Link>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
          </span>
        </div>
        <p className="text-gray-600 dark:text-gray-400 mt-1">{comment.content}</p>
      </div>
    </div>
  )
}
