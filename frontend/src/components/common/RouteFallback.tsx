import { SkeletonBlock, SkeletonCards } from './Skeleton'

/**
 * What the page area shows while the page the reader asked for is still arriving.
 *
 * This exists because the site is now loaded in pieces rather than as one file:
 * the newsroom's own screens - the admin's dashboard with its charts, the writer's
 * editor with its form library, the live studio with its socket client - are
 * several hundred kilobytes that a reader who came for a headline has no
 * particular use for, and making a phone on a Rwandan network download all of
 * them before it draws the home page was the wrong trade.
 *
 * The pieces are asked for the moment a link is hovered or touched, so by the
 * time the tap lands the page is usually already in the phone and the reader
 * never sees this at all - they stay on the page they were on, and the next one
 * replaces it when it is ready.
 *
 * What is left here is not a loader. The bar across the top of every page is the
 * only thing on RADAR that says"hold on"; this only reserves the height the
 * arriving page will take, so the layout does not jump under a reader's thumb.
 */
export default function RouteFallback() {
  return (
    <div className="min-h-[60vh] space-y-8 px-4 py-10 sm:px-6" aria-hidden="true">
      <SkeletonBlock lines={2} className="mx-auto max-w-md" />
      <SkeletonCards count={3} className="mx-auto max-w-5xl" />
    </div>
  )
}
