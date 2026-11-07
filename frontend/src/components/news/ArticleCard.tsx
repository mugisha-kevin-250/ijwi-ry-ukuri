import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { Calendar, Eye, Heart, Tag, UserPlus, Share2, Bookmark } from 'lucide-react'
import type { Article } from '../../types'
import { cn } from '../../utils/cn'
import { useI18n } from '../../context/I18nContext'
import { useArticleBookmark, useAuthorFollow } from '../../utils/engagementStore'
import Avatar from '../common/Avatar'
import MediaImage from '../common/MediaImage'

interface ArticleCardProps {
  article: Article
  variant?: 'default' | 'compact' | 'featured'
  showCategory?: boolean
  showAuthor?: boolean
  showStats?: boolean
  className?: string
}

export default function ArticleCard({
  article,
  variant = 'default',
  showCategory = true,
  showAuthor = true,
  showStats = true,
  className,
}: ArticleCardProps) {
  const author = typeof article.author === 'object' ? article.author : null
  const category = typeof article.category === 'object' ? article.category : null
  const { t } = useI18n()
  const { bookmarked, toggle: toggleBookmark } = useArticleBookmark(article)
  const { following, toggle: toggleFollow } = useAuthorFollow(author?._id, article.followingAuthor)

  const handleShare = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const url = `${window.location.origin}/article/${article.slug}`
    if (navigator.share) {
      try {
        await navigator.share({
          title: article.title,
          text: article.summary,
          url,
        })
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          // Fallback to clipboard
          await navigator.clipboard.writeText(url)
        }
      }
    } else {
      await navigator.clipboard.writeText(url)
    }
  }

  const handleFollow = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    void toggleFollow()
  }

  const handleBookmark = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    void toggleBookmark()
  }

  if (variant === 'compact') {
    return (
      <Link
        to={`/article/${article.slug}`}
        className={cn('flex gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors', className)}
      >
        {article.featuredImage && (
          <MediaImage
            src={article.featuredImage}
            alt=""
            className="h-20 w-20 rounded-lg object-cover flex-shrink-0"
            loading="lazy"
          />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 dark:text-white line-clamp-2">{article.title}</h3>
          {showAuthor && author && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">
              {t('articles.by')} {author.fullName}
            </p>
          )}
          {showStats && (
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                {article.views.toLocaleString()}
              </span>
              <span className="flex items-center gap-1">
                <Heart className="h-3.5 w-3.5" aria-hidden="true" />
                {article.likes.toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </Link>
    )
  }

  if (variant === 'featured') {
    return (
      <article className={cn('relative overflow-hidden rounded-xl bg-gray-50 dark:bg-gray-800', className)}>
        {article.featuredImage && (
          <Link to={`/article/${article.slug}`} className="block aspect-[16/9] overflow-hidden">
            <MediaImage
              src={article.featuredImage}
              alt=""
              className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
              loading="eager"
            />
          </Link>
        )}
        <div className="p-6">
          {showCategory && category && (
            <Link
              to={`/category/${category.slug}`}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300 mb-3"
            >
              <Tag className="h-3 w-3" aria-hidden="true" />
              {category.name}
            </Link>
          )}
          <Link to={`/article/${article.slug}`}>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3 line-clamp-2 hover:text-brand-600 dark:hover:text-brand-400 transition-colors">
              {article.title}
            </h2>
          </Link>
          <p className="text-gray-600 dark:text-gray-400 mb-4 line-clamp-3">{article.summary}</p>
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
            {showAuthor && author && (
              <Link
                to={`/user/${author._id}`}
                className="flex items-center gap-1.5 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
              >
                <Avatar
                  src={author.avatar}
                  name={author.fullName}
                  className="h-5 w-5 bg-brand-100 dark:bg-brand-900"
                  textClassName="text-xs font-medium text-brand-600 dark:text-brand-400"
                />
                <span>{author.fullName}</span>
              </Link>
            )}
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
              {formatDistanceToNow(new Date(article.publishedAt || article.createdAt), { addSuffix: true })}
            </span>
            {showStats && (
              <>
                <span className="flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  {article.views.toLocaleString()} {t('articles.views')}
                </span>
                <span className="flex items-center gap-1">
                  <Heart className="h-3.5 w-3.5" aria-hidden="true" />
                  {article.likes.toLocaleString()}
                </span>
              </>
            )}
          </div>
        </div>
      </article>
    )
  }

  return (
    <article className={cn('flex flex-col h-full overflow-hidden', className)}>
      {article.featuredImage && (
        <Link to={`/article/${article.slug}`} className="block aspect-video overflow-hidden">
          <MediaImage
            src={article.featuredImage}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
            loading="lazy"
          />
        </Link>
      )}
      <div className="flex-1 flex flex-col p-4">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {showCategory && category && (
            <Link
              to={`/category/${category.slug}`}
              className="px-2 py-0.5 rounded text-xs font-medium bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300"
            >
              {category.name}
            </Link>
          )}
          <time className="text-xs text-gray-500 dark:text-gray-400">
            {formatDistanceToNow(new Date(article.publishedAt || article.createdAt), { addSuffix: true })}
          </time>
        </div>
        <Link to={`/article/${article.slug}`}>
          <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-2 mb-2 hover:text-brand-600 dark:hover:text-brand-400 transition-colors">
            {article.title}
          </h3>
        </Link>
        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3 mb-4 flex-1">{article.summary}</p>
        {showStats && (
          <div className="flex items-center gap-3 mb-4 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              {article.views.toLocaleString()}
            </span>
            <span className="flex items-center gap-1">
              <Heart className="h-3.5 w-3.5" aria-hidden="true" />
              {article.likes.toLocaleString()}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
          {showAuthor && author && (
            <Link
              to={`/user/${author._id}`}
              className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
            >
              <Avatar
                src={author.avatar}
                name={author.fullName}
                className="h-6 w-6 bg-brand-100 dark:bg-brand-900"
                textClassName="text-xs font-medium text-brand-600 dark:text-brand-400"
              />
              <span className="hidden sm:block truncate max-w-[120px]">{author.fullName}</span>
            </Link>
          )}
          <button
                  onClick={handleShare}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-500 hover:text-blue-500 transition-colors"
                  aria-label={t('articles.share')}
                  title={t('articles.share')}
                >
                  <Share2 className="h-5 w-5" aria-hidden="true" />
                </button>
                <button
                  onClick={handleBookmark}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                    bookmarked
                      ? 'text-[var(--color-brand-text)] bg-[var(--color-brand-light)]'
                      : 'text-gray-500 hover:text-[var(--color-brand-text)]'
                  )}
                  aria-label={t('articles.bookmark')}
                  title={t('articles.bookmark')}
                >
                  <Bookmark className={cn('h-5 w-5', bookmarked && 'fill-current')} aria-hidden="true" />
                </button>
                <button
                  onClick={handleFollow}
                  aria-pressed={following}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                    following ? 'text-[var(--color-brand-text)]' : 'text-gray-500 hover:text-[var(--color-brand-text)]'
                  )}
                  aria-label={t('articles.follow')}
                  title={t('articles.follow')}
                >
                  <UserPlus className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </article>
    )
  }