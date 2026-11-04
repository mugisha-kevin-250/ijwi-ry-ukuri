import ArticleCard from './ArticleCard'
import type { Article } from '../../types'
import { cn } from '../../utils/cn'

interface ArticleListProps {
  articles: Article[]
  variant?: 'grid' | 'list' | 'featured'
  isLoading?: boolean
  emptyMessage?: string
  className?: string
}

export default function ArticleList({
  articles,
  variant = 'grid',
  isLoading = false,
  emptyMessage = 'No articles found.',
  className,
}: ArticleListProps) {
  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        {Array.from({ length: 6 }).map((_, i) => (
          <ArticleCard
            key={i}
            article={{
              _id: `loading-${i}`,
              title: 'Loading article title...',
              slug: 'loading',
              summary: 'Loading article summary...',
              content: '',
              author: { _id: '1', fullName: 'Author Name', username: 'author' },
              category: { _id: '1', name: 'Category', slug: 'category' },
              tags: [],
              status: 'published',
              views: 0,
              validViews: 0,
              uniqueViews: 0,
              likes: 0,
              commentsCount: 0,
              readingTime: 5,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }}
            variant={variant === 'grid' ? 'default' : 'compact'}
          />
        ))}
      </div>
    )
  }

  if (articles.length === 0) {
    return (
      <div className={cn('text-center py-12', className)}>
        <p className="text-gray-500 dark:text-gray-400">{emptyMessage}</p>
      </div>
    )
  }

  if (variant === 'featured') {
    const [featured, ...rest] = articles
    return (
      <div className={cn('space-y-8', className)}>
        {featured && <ArticleCard article={featured} variant="featured" />}
        {rest.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">More Articles</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {rest.map((article) => (
                <ArticleCard key={article._id} article={article} />
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  if (variant === 'list') {
    return (
      <div className={cn('space-y-3', className)}>
        {articles.map((article) => (
          <ArticleCard key={article._id} article={article} variant="compact" />
        ))}
      </div>
    )
  }

  return (
    <div className={cn('grid gap-6', className, {
      'grid-cols-1': true,
      'sm:grid-cols-2': variant === 'grid',
      'lg:grid-cols-3': variant === 'grid',
      'xl:grid-cols-4': variant === 'grid',
    })}>
      {articles.map((article) => (
        <ArticleCard key={article._id} article={article} />
      ))}
    </div>
  )
}