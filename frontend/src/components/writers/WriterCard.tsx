import { Link } from 'react-router-dom'
import { User, Eye, MapPin, Globe, PenTool } from 'lucide-react'
import type { WriterProfile } from '../../types'
import { cn } from '../../utils/cn'
import Avatar from '../common/Avatar'

interface WriterCardProps {
  writer: WriterProfile
  variant?: 'default' | 'compact' | 'profile'
  className?: string
}

export default function WriterCard({
  writer,
  variant = 'default',
  className,
}: WriterCardProps) {
  if (variant === 'compact') {
    return (
      <Link
        to={`/user/${writer._id}`}
        className={cn('flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors', className)}
      >
        <Avatar
          src={writer.profileImage}
          name={writer.fullName}
          className="h-12 w-12 flex-shrink-0 bg-brand-100 dark:bg-brand-900"
          textClassName="text-lg font-bold text-brand-600 dark:text-brand-400"
        />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 dark:text-white truncate">{writer.fullName}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">@{writer.username}</p>
        </div>
        {writer.totalArticles > 0 && (
          <span className="text-sm text-gray-500 dark:text-gray-400">{writer.totalArticles} articles</span>
        )}
      </Link>
    )
  }

  if (variant === 'profile') {
    return (
      <div className={cn('space-y-6', className)}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <Avatar
            src={writer.profileImage}
            name={writer.fullName}
            className="h-24 w-24 flex-shrink-0 bg-brand-100 dark:bg-brand-900"
            textClassName="text-3xl font-bold text-brand-600 dark:text-brand-400"
          />
          <div className="flex-1 text-center sm:text-left">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{writer.fullName}</h2>
            <p className="text-gray-500 dark:text-gray-400">@{writer.username}</p>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 mt-3 text-sm text-gray-500 dark:text-gray-400">
              {writer.country && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                  {writer.country}
                </span>
              )}
              {writer.language && (
                <span className="flex items-center gap-1">
                  <Globe className="h-4 w-4" aria-hidden="true" />
                  {writer.language}
                </span>
              )}
              <span className="flex items-center gap-1">
                <User className="h-4 w-4" aria-hidden="true" />
                {writer.totalArticles} articles
              </span>
              <span className="flex items-center gap-1">
                <Eye className="h-4 w-4" aria-hidden="true" />
                {writer.totalValidViews.toLocaleString()} views
              </span>
            </div>
          </div>
        </div>
        {writer.bio && (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <p className="text-gray-600 dark:text-gray-400">{writer.bio}</p>
          </div>
        )}
        {writer.reasonForWriting && (
          <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <h3 className="font-medium text-gray-900 dark:text-white mb-2">Why I Write</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">{writer.reasonForWriting}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <Link
            to={`/user/${writer._id}`}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors"
          >
            View Profile
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('p-6 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-brand-300 dark:hover:border-brand-700 hover:shadow-md transition-all', className)}>
      <Link to={`/user/${writer._id}`} className="block">
        <div className="flex items-start gap-4">
          <Avatar
            src={writer.profileImage}
            name={writer.fullName}
            className="h-16 w-16 flex-shrink-0 bg-brand-100 dark:bg-brand-900"
            textClassName="text-2xl font-bold text-brand-600 dark:text-brand-400"
          />
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-white truncate">{writer.fullName}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">@{writer.username}</p>
            {writer.bio && (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{writer.bio}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
              {writer.country && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                  {writer.country}
                </span>
              )}
              {writer.language && (
                <span className="flex items-center gap-1">
                  <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                  {writer.language}
                </span>
              )}
              <span className="flex items-center gap-1">
                <PenTool className="h-3.5 w-3.5" aria-hidden="true" />
                {writer.totalArticles} articles
              </span>
              <span className="flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                {writer.totalValidViews.toLocaleString()} views
              </span>
            </div>
          </div>
        </div>
      </Link>
    </div>
  )
}