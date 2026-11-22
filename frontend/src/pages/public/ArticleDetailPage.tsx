import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { formatDistanceToNow, format } from 'date-fns'
import { Calendar, ChevronRight, Clock, Eye, Heart, MessageSquare, Bookmark, Share2, FileQuestion, UserPlus, Flag, Trash2 } from 'lucide-react'
import type { Article, Comment } from '../../types'
import { publicAPI, articleAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../context/I18nContext'
import ArticleList from '../../components/news/ArticleList'
import { SkeletonArticle, SkeletonCards } from '../../components/common/Skeleton'
import EmptyState from '../../components/common/EmptyState'
import StoryVideo from '../../components/common/StoryVideo'
import StoryGallery from '../../components/common/StoryGallery'
import BreakingBadge from '../../components/news/BreakingBadge'
import { readsAsBreaking } from '../../utils/breakingStory'
import Avatar from '../../components/common/Avatar'
import MediaImage from '../../components/common/MediaImage'
import AdSlot from '../../components/ads/AdSlot'
import ListenButton from '../../components/audio/ListenButton'
import TranslationNotice from '../../components/news/TranslationNotice'
import AskRadarAi from '../../components/ai/AskRadarAi'
import { cn } from '../../utils/cn'
import { useSeo, absoluteSiteUrl } from '../../utils/useSeo'
import { sanitizeHtml } from '../../utils/sanitizeHtml'
import { requestSignIn } from '../../utils/signInPrompt'
import { useArticleViewTracking } from '../../utils/viewTracking'
import { useArticleBookmark, useArticleLike, useAuthorFollow, useVisiblePoll } from '../../utils/engagementStore'
import { shareArticle } from '../../utils/shareArticle'
import { categoryGroupSlug, categoryHref, categoryLabel } from '../../data/categoryVisuals'
import { looksLikeHtml, splitParagraphs } from '../../utils/storyBody'

/** article.category arrives populated or as a bare id, depending on the route. */
function storyCategory(article: Article | null) {
  if (!article) return null
  return typeof article.category === 'object' && article.category !== null ? article.category : null
}

/**
 * A source's status is the desk's claim, not the author's, so it is the one thing
 * about a source a reader is shown as a verdict. The reason behind the verdict -
 * the staffer's note and name - never reaches this page.
 */
const SOURCE_STATUS_LABEL: Record<string, string> = {
  verified: 'articles.sourceVerified',
  pending: 'articles.sourcePending',
  rejected: 'articles.sourceRejected',
}

const SOURCE_STATUS_CLASS: Record<string, string> = {
  verified: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  rejected: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-200',
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
            // Paid copy is not journalism, so it is not described as a news
            // report. The visible"Sponsored" line and this type say the same
            // thing to the two audiences that read the page.
            '@type': article.isSponsored ? 'Article' : 'NewsArticle',
            mainEntityOfPage: {
              '@type': 'WebPage',
              '@id': absoluteSiteUrl(`/article/${slug}`),
            },
            headline: article.title,
            description: article.metaDescription || article.summary,
            image: article.featuredImage ? [article.featuredImage] : undefined,
            datePublished: article.publishedAt ?? article.createdAt,
            dateModified: article.updatedAt ?? article.createdAt,
            // The newsroom files every story in English and a reader picks a
            // translation, so the language a story arrives in is its own field
            // and English is the fallback - not the other way round.
            inLanguage: article.language ?? 'en',
            isAccessibleForFree: true,
            articleSection: seoCategory ? categoryLabel(seoCategory, t) : undefined,
            keywords: article.tags?.length ? article.tags.join(', ') : undefined,
            author:
              typeof article.author === 'object' && article.author !== null
                ? {
                    '@type': 'Person',
                    name: article.author.fullName,
                    // The byline points at the author's page, which is also in
                    // the directory: one person, one address, twice declared.
                    url: absoluteSiteUrl(`/user/${article.author._id}`),
                  }
                : { '@type': 'Person', name: '' },
            publisher: {
              '@type': 'Organization',
              name: 'RADAR',
              url: absoluteSiteUrl('/'),
              logo: {
                '@type': 'ImageObject',
                url: absoluteSiteUrl('/icons/icon-192x192.png'),
              },
            },
            ...(article.isSponsored && article.sponsor
              ? { sponsor: { '@type': 'Organization', name: article.sponsor } }
              : {}),
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
        const articleRes = await publicAPI.getArticleBySlug(slug)
        const payload = articleRes.data.data as any
        const articleData = (payload?.article ?? payload) as Article | null
        if (!articleData) {
          navigate('/articles')
          return
        }
        setArticle(articleData)
      } catch (error) {
        console.error('Failed to fetch article:', error)
        navigate('/articles')
      } finally {
        setIsLoading(false)
      }
    }
    fetchArticle()
  }, [slug, navigate, user])

  // The follow-up shelf is asked from the server by section, so it holds that
  // section's newest stories instead of whatever fell inside a client-side slice.
  useEffect(() => {
    const section = categoryGroupSlug(storyCategory(article))
    const storyId = article?._id
    if (!storyId || !section) {
      setRelatedArticles([])
      return
    }
    let active = true
    const loadRelated = async () => {
      try {
        const res = await publicAPI.getArticles({ category: section, page: 1, limit: 5 })
        if (!active) return
        const pool = (res.data.data?.articles as Article[] | undefined) || []
        setRelatedArticles(pool.filter((item) => item._id !== storyId).slice(0, 4))
      } catch {
        if (active) setRelatedArticles([])
      }
    }
    void loadRelated()
    return () => {
      active = false
    }
  }, [article?._id, article?.category])

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
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-6 sm:px-6">
        <SkeletonArticle className="max-w-4xl" lines={6} />
        <SkeletonCards count={3} />
      </div>
    )
  }

  if (!article) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
        <EmptyState
          icon={<FileQuestion className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />}
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
    <div className="mx-auto max-w-4xl px-4 pt-6 sm:px-6 lg:grid lg:max-w-6xl lg:grid-cols-[minmax(0,270px)_minmax(0,1fr)] lg:items-start lg:gap-10">
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
        {/* One line of flags, in the order a reader weighs them: what is urgent,
            then what somebody paid for. Both say something about the story that
            its headline does not, and neither is allowed to become a wall of
            decoration - breaking is capped and ages out, sponsored is set by
            the desk and not the author. */}
        {(readsAsBreaking(article) || article.isSponsored) && (
          <p className="flex flex-wrap items-center gap-2 text-xs">
            <BreakingBadge article={article} />
            {article.isSponsored && (
              <>
                <span className="rounded-full bg-amber-100 px-2.5 py-1 font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                  {t('articles.sponsored')}
                </span>
                {article.sponsor && (
                  <span className="text-gray-600 dark:text-gray-300">
                    {t('articles.sponsoredPaidBy')} {article.sponsor}
                  </span>
                )}
              </>
            )}
          </p>
        )}
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white leading-tight">{article.title}</h1>
        {/* There is no"written with AI" badge here any more. Whether a machine
            took the first draft is a newsroom fact - it is stored on the story,
            it shows in the review queue, and an editor decides what the reader
            is told - but a label over the headline made every AI-assisted story
            look like a different class of reporting before anyone had read a
            line of it. */}
        {/* The byline facts wrap on a phone, and a four-unit gap between them
            put the date, the reading time and the view count on three separate
            lines under the headline. Rows still need air; words in one row do
            not need quite so much of it. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-500 dark:text-gray-400 sm:gap-4">
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
        {/* The story can be heard as well as read. The control is the device's
            own voice and only appears when the device actually has one. */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <ListenButton article={article} />
          {/* Which language is on the screen, and whether a machine wrote it. */}
          <TranslationNotice article={article} />
        </div>
      </header>

      {article.featuredImage && (
        <figure className="relative">
          <div className="relative aspect-video rounded-xl overflow-hidden">
            <MediaImage
              src={article.featuredImage}
              alt={article.title}
              className="h-full w-full object-cover"
            />
          </div>
          {/* A picture the newsroom did not take says whose it is, and links to
              where it was published. */}
          {/* The caption says what is in front of the reader; the credit says
              whose photograph it is. Both belong to the picture, and neither is
              invented: an uncaptioned photo is shown uncaptioned. */}
          {(article.imageCaption || article.imageCredit) && (
            <figcaption className="mt-1.5 text-xs text-slate-500">
              {article.imageCaption && <span>{article.imageCaption}</span>}
              {article.imageCaption && article.imageCredit && <span className="mx-1.5" aria-hidden="true">·</span>}
              {article.imageCredit && (
                <>
                  {t('articles.imageCredit')}: {article.imageSourceUrl ? (
                    <a href={article.imageSourceUrl} target="_blank" rel="noreferrer nofollow" className="underline hover:text-slate-700">
                      {article.imageCredit}
                    </a>
                  ) : (
                    article.imageCredit
                  )}
                </>
              )}
            </figcaption>
          )}
        </figure>
      )}

      {/* The clip the author attached, between the picture and the copy. It is
          the player the platform serves - YouTube's or Vimeo's own, or the
          browser's for a file the newsroom holds - and it waits for the reader
          to press play. */}
      {(article.videoEmbedUrl || article.videoUrl) && (
        <figure>
          <StoryVideo
            source={article.videoSource}
            embedUrl={article.videoEmbedUrl}
            videoUrl={article.videoUrl}
            title={article.title}
          />
        </figure>
      )}

      {/* Whatever else the reporting carries: the second photograph, the wider
          shot, the clip that comes after the first. In the order the author put
          them, each with what it shows and whose it is. */}
      <StoryGallery items={article.media} title={article.title} />

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

      {/* What the newsroom got wrong, in the order it said so. A correction is
          appended and dated rather than folded quietly back into the copy: the
          story a reader shared is the story that was published, and the notice
          has to travel with it. */}
      {!!article.corrections?.length && (
        <section
          aria-label={t('articles.corrections')}
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/40"
        >
          <h2 className="text-sm font-bold uppercase tracking-wide text-amber-900 dark:text-amber-200">
            {article.corrections.length === 1 ? t('articles.correction') : t('articles.corrections')}
          </h2>
          <ol className="mt-2 space-y-2">
            {(article.corrections ?? []).map((entry, index) => (
              <li key={`${entry.at || 'undated'}-${index}`} className="text-sm leading-relaxed text-amber-900 dark:text-amber-100">
                {entry.at && <time dateTime={entry.at} className="font-semibold">{formatDate(entry.at)}</time>}
                {entry.at && <span className="mx-1.5" aria-hidden="true">·</span>}
                {entry.note}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* What the report is standing on. The author names their own sources;
          whether one has been checked is the desk's call, so the status is the
          desk's word on the page and the argument behind it stays internal. A
          link here is a link a reader can follow and judge for themselves. */}
      {!!article.sources?.length && (
        <section
          aria-label={t('articles.sources')}
          className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900"
        >
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200">
            {t('articles.sources')}
          </h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('articles.sourcesIntro')}</p>
          <ol className="mt-3 space-y-3">
            {(article.sources ?? []).map((source, index) => (
              <li key={source._id || `source-${index}`} className="text-sm leading-relaxed">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {source.title || source.organization || source.url}
                  </span>
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', SOURCE_STATUS_CLASS[source.verificationStatus || 'pending'] || SOURCE_STATUS_CLASS.pending)}>
                    {t(SOURCE_STATUS_LABEL[source.verificationStatus || 'pending'] || 'articles.sourcePending')}
                  </span>
                  {source.type && (
                    <span className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {t(`articles.sourceType.${source.type}`)}
                    </span>
                  )}
                </div>
                {source.organization && source.title && (
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{source.organization}</p>
                )}
                {!!source.quote && (
                  <p className="mt-1 text-xs italic text-gray-600 dark:text-gray-300">“{source.quote}”</p>
                )}
                {(source.url || source.accessedAt) && (
                  <p className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                    {source.url && (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="font-semibold text-brand-700 hover:underline dark:text-brand-300"
                      >
                        {t('articles.sourceOpen')}
                      </a>
                    )}
                    {source.accessedAt && (
                      <span className="text-gray-500 dark:text-gray-400">
                        {t('articles.sourceAccessed')} {formatDate(source.accessedAt)}
                      </span>
                    )}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* End of the read. Before anything else competes for attention, the
          reader who wants more of this story gets a way to ask about it - and
          the question is already written, because what they want is more about
          the thing they just read, not a blank box to describe it into. */}
      <div className="pt-6">
        <AskRadarAi
          variant="card"
          slug={article.slug}
          seedQuestion={`Explain more about this story: ${article.title}`}
          suggestions={[
            t('ai.storySuggest1'),
            t('ai.storySuggest2'),
            t('ai.storySuggest3'),
          ]}
        />
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
  const [busyComment, setBusyComment] = useState('')
  const [threadNote, setThreadNote] = useState('')
  const [threadError, setThreadError] = useState('')

  useEffect(() => {
    const fetchComments = async () => {
      try {
        const response = await articleAPI.getComments(articleId)
        setComments(response.data.data?.comments || [])
        setIsLoading(false)
      } catch (error) {
        console.error('Failed to fetch comments:', error)
        // Saying the thread did not arrive is the honest answer. Leaving the
        //"no comments yet" line up would claim nobody had spoken.
        setIsLoading(false)
        setComments([])
        setThreadError(t('articles.threadLoadFailed'))
      }
    }
    fetchComments()
  }, [articleId, t])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) {
      requestSignIn()
      return
    }
    if (!newComment.trim()) return

    setIsSubmitting(true)
    setThreadError('')
    try {
      const response = await articleAPI.addComment(articleId, { content: newComment })
      const created = response.data.data?.comment
      if (created) setComments((prev) => [created, ...prev])
      setNewComment('')
    } catch (error) {
      console.error('Failed to add comment:', error)
      setThreadError(t('articles.postFailed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  // A report is a request that a human look, and the only thing a reader can do
  // to somebody else's words. The server keeps the comment on the page, so the
  // row repaints with the flag rather than disappearing.
  const report = async (comment: Comment) => {
    if (!user) return requestSignIn()
    setBusyComment(comment._id)
    setThreadError('')
    try {
      const response = await articleAPI.reportComment(comment._id)
      const updated = response.data.data?.comment
      setComments((prev) => prev.map((row) => (row._id === comment._id ? { ...row, reported: true, status: updated?.status || row.status } : row)))
      setThreadNote(t('articles.reportDone'))
    } catch (error) {
      console.error('Failed to report comment:', error)
      setThreadError(t('articles.reportFailed'))
    } finally {
      setBusyComment('')
    }
  }

  const remove = async (comment: Comment) => {
    setBusyComment(comment._id)
    setThreadError('')
    try {
      await articleAPI.deleteComment(comment._id)
      setComments((prev) => prev.filter((row) => row._id !== comment._id))
      setThreadNote(t('articles.commentRemoved'))
    } catch (error) {
      console.error('Failed to delete comment:', error)
      setThreadError(t('articles.deleteFailed'))
    } finally {
      setBusyComment('')
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
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={!newComment.trim() || isSubmitting}
              className="px-4 py-2 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? t('articles.posting') : t('articles.postComment')}
            </button>
            <span className="text-xs text-gray-500 dark:text-gray-400">{t('articles.moderationNote')}</span>
          </div>
        </form>
      ) : (
        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
          <p className="text-gray-600 dark:text-gray-400">
            <Link to="/login" className="text-brand-600 dark:text-brand-400 hover:underline font-medium">{t('nav.login')}</Link> {t('articles.toComment')}
          </p>
        </div>
      )}

      {threadNote && <p className="text-sm text-green-700 dark:text-green-400">{threadNote}</p>}
      {threadError && <p className="text-sm text-red-700 dark:text-red-400">{threadError}</p>}

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonArticle key={i} lines={2} />
          ))}
        </div>
      ) : comments.length === 0 ? (
        <p className="text-center text-gray-500 dark:text-gray-400 py-8">
          {threadError ? t('articles.threadUnavailable') : t('articles.noComments')}
        </p>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <CommentItem
              key={comment._id}
              comment={comment}
              isMine={!!user && typeof comment.user === 'object' && comment.user._id === user._id}
              isBusy={busyComment === comment._id}
              onReport={() => void report(comment)}
              onDelete={() => void remove(comment)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CommentItem({
  comment,
  isMine,
  isBusy,
  onReport,
  onDelete,
}: {
  comment: Comment
  isMine: boolean
  isBusy: boolean
  onReport: () => void
  onDelete: () => void
}) {
  const { t } = useI18n()
  const reader = typeof comment.user === 'object' ? comment.user : null
  return (
    <div className="flex gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <Avatar
        src={reader?.avatar}
        name={reader?.fullName}
        className="h-10 w-10 flex-shrink-0 bg-brand-100 dark:bg-brand-900"
        textClassName="text-sm font-medium text-brand-600 dark:text-brand-400"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Link
            to={reader ? `/user/${reader._id}` : '#'}
            className="font-medium text-gray-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400"
          >
            {reader?.fullName || 'Unknown'}
          </Link>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
          </span>
        </div>
        <p className="text-gray-600 dark:text-gray-400 mt-1 break-words">{comment.content}</p>
        <div className="mt-2 flex items-center gap-3">
          {comment.reported ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
              <Flag className="h-3.5 w-3.5" />
              {t('articles.reported')}
            </span>
          ) : (
            !isMine && (
              <button
                type="button"
                onClick={onReport}
                disabled={isBusy}
                className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-amber-700 disabled:opacity-50"
              >
                <Flag className="h-3.5 w-3.5" />
                {t('articles.reportComment')}
              </button>
            )
          )}
          {isMine && (
            <button
              type="button"
              onClick={onDelete}
              disabled={isBusy}
              className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-red-700 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t('articles.deleteComment')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
