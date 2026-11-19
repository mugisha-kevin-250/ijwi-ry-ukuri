import { cn } from '../../utils/cn'

/**
 * The shape of content that has not arrived yet.
 *
 * These are not a loader. Nothing here moves, nothing here claims to be working,
 * and the only thing on this site that says"hold on" is the blue bar across the
 * top of every page. What a block like this is for is the layout: a story's
 * headline reserves the height its headline will take, so the paragraph a reader
 * was about to tap does not slide out from under their thumb when the text lands.
 *
 * They are deliberately grey rectangles rather than invented headlines. A page
 * that draws plausible-looking words it has not been given is a page that has
 * already lied about the news.
 */

export function SkeletonLine({ className }: { className?: string }) {
  return <div className={cn('rounded bg-slate-100 dark:bg-white/10', className)} aria-hidden="true" />
}

/** The heading plus byline a story list row is about to grow. */
export function SkeletonBlock({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden="true">
      <SkeletonLine className="h-4 w-3/4" />
      {Array.from({ length: lines - 1 }).map((_, index) => (
        <SkeletonLine key={index} className="h-3 w-1/2" />
      ))}
    </div>
  )
}

/** The shape a story, a comment or a list row grows into. */
export function SkeletonArticle({ lines = 4, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} aria-hidden="true">
      <SkeletonLine className="h-6 w-5/6" />
      <SkeletonLine className="h-3 w-2/5" />
      {Array.from({ length: lines }).map((_, index) => (
        <SkeletonLine key={index} className={cn('h-3', index === lines - 1 ? 'w-3/5' : 'w-full')} />
      ))}
    </div>
  )
}

/** The cards a grid is about to fill, at the size the grid really uses. */
export function SkeletonCards({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3', className)} aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="space-y-3">
          <SkeletonLine className="aspect-video w-full rounded-lg" />
          <SkeletonLine className="h-4 w-3/4" />
          <SkeletonLine className="h-4 w-1/2" />
          <SkeletonLine className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  )
}
