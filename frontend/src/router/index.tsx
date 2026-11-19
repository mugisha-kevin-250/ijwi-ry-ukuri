import { createBrowserRouter, Navigate, Outlet, ScrollRestoration, useLocation, useParams } from 'react-router-dom'
import { type ReactNode, Suspense, lazy, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { sectionHrefFor } from '../data/sections'
import { trackPageView } from '../utils/analytics'
import RouteProgressBar from '../components/common/RouteProgressBar'
import RouteFallback from '../components/common/RouteFallback'
import ErrorBoundary from '../components/common/ErrorBoundary'
import OfflineNotice from '../components/common/OfflineNotice'
import RouteErrorScreen from '../components/common/RouteErrorScreen'
import WriterAccessGate from '../components/auth/WriterAccessGate'
import { holdNavigation } from '../utils/apiActivity'
import { SkeletonBlock } from '../components/common/Skeleton'
import AdminLayout from '../layouts/AdminLayout'
import PublicLayout from '../layouts/PublicLayout'
import WriterLayout from '../layouts/WriterLayout'
import HomePage from '../pages/public/HomePage'
import ArticleDetailPage from '../pages/public/ArticleDetailPage'
//
// Everything below this line is downloaded only when a reader asks for it.
//
// The rule for what stays above is: a page a cold visitor can arrive at directly
// from a search result, a shared link or the home screen is compiled into the
// first piece of JavaScript, and everything else waits. A reader who lands on a
// story has that story's code already; a reader who never opens the newsroom's
// own screens never downloads the charts, the article form or the live-video
// socket client that those screens are built from.
//
const AboutPage = lazy(() => import('../pages/public/AboutPage'))
const AdvertisingPage = lazy(() => import('../pages/public/AdvertisingPage'))
const ArticleListPage = lazy(() => import('../pages/public/ArticleListPage'))
const AuthPage = lazy(() => import('../pages/public/AuthPage'))
const AuthorsPage = lazy(() => import('../pages/public/AuthorsPage'))
const CategoriesPage = lazy(() => import('../pages/public/CategoriesPage'))
const CategoryPage = lazy(() => import('../pages/public/CategoryPage'))
const ContactPage = lazy(() => import('../pages/public/ContactPage'))
const CookiePolicyPage = lazy(() => import('../pages/public/CookiePolicyPage'))
const CorrectionsPage = lazy(() => import('../pages/public/CorrectionsPage'))
const DisclaimerPage = lazy(() => import('../pages/public/DisclaimerPage'))
const EditorialPolicyPage = lazy(() => import('../pages/public/EditorialPolicyPage'))
const LivePage = lazy(() => import('../pages/public/LivePage'))
const LiveSportsPage = lazy(() => import('../pages/public/LiveSportsPage'))
const MyLibraryPage = lazy(() => import('../pages/public/MyLibraryPage'))
const PasswordRecoveryPage = lazy(() => import('../pages/public/PasswordRecoveryPage'))
const PrivacyPage = lazy(() => import('../pages/public/PrivacyPage'))
const RadioPage = lazy(() => import('../pages/public/RadioPage'))
const SearchPage = lazy(() => import('../pages/public/SearchPage'))
const SectionPage = lazy(() => import('../pages/public/SectionPage'))
const TermsPage = lazy(() => import('../pages/public/TermsPage'))
const UserProfilePage = lazy(() => import('../pages/public/UserProfilePage'))
const WeatherPage = lazy(() => import('../pages/public/WeatherPage'))

const DashboardPage = lazy(() => import('../pages/dashboard/DashboardPage'))

const EditorCommentsPage = lazy(() => import('../pages/editor/EditorCommentsPage'))
const EditorDashboardPage = lazy(() => import('../pages/editor/EditorDashboardPage'))
const EditorQueuePage = lazy(() => import('../pages/editor/EditorQueuePage'))
const EditorReviewPage = lazy(() => import('../pages/editor/EditorReviewPage'))

const AdminAiWriterPage = lazy(() => import('../pages/admin/AdminAiWriterPage'))
const AdminArticlesPage = lazy(() => import('../pages/admin/AdminArticlesPage'))
const AdminAdsPage = lazy(() => import('../pages/admin/AdminAdsPage'))
const AdminCategoriesPage = lazy(() => import('../pages/admin/AdminCategoriesPage'))
const AdminLoginPage = lazy(() => import('../pages/admin/AdminLoginPage'))
const AdminMessagesPage = lazy(() => import('../pages/admin/AdminMessagesPage'))
const AdminPayoutsPage = lazy(() => import('../pages/admin/AdminPayoutsPage'))
const AdminSettingsPage = lazy(() => import('../pages/admin/AdminSettingsPage'))
const AdminUserDetailPage = lazy(() => import('../pages/admin/AdminUserDetailPage'))
const AdminUsersPage = lazy(() => import('../pages/admin/AdminUsersPage'))
const AdminWritersPage = lazy(() => import('../pages/admin/AdminWritersPage'))

const WriterArticleEditorPage = lazy(() => import('../pages/writer/WriterArticleEditorPage'))
const WriterArticlesPage = lazy(() => import('../pages/writer/WriterArticlesPage'))
const WriterDashboardPage = lazy(() => import('../pages/writer/WriterDashboardPage'))
const WriterEarningsPage = lazy(() => import('../pages/writer/WriterEarningsPage'))

// A page behind a role check can now be a chunk that has to be fetched, and the
// gate that decides whether to render it is not that fetch. So the boundary sits
// outside the gate, at the route, and the fallback is the same quiet placeholder
// the public pages use.
function DelayedPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>
}

/**
 * Which piece of JavaScript answers which address.
 *
 * The pages above are downloaded only when they are asked for, and a click used
 * to be the first moment anyone requested the file - so the reader watched a
 * placeholder while the phone fetched the page it had already decided to open.
 * A hovered, touched or keyboard-focused link asks for the same file a moment
 * earlier, and the answer is already in the browser when the tap lands: the
 * reader stays on the page they were on, and the next one replaces it whole.
 *
 * The addresses are matched static-first, then in the order they are written, so
 *"/articles" is never answered by the catch-all"/:section" page.
 */
const PAGE_LOADERS: { path: string; load: () => Promise<unknown> }[] = [
  { path: '/login', load: () => import('../pages/public/AuthPage') },
  { path: '/register', load: () => import('../pages/public/AuthPage') },
  { path: '/forgot-password', load: () => import('../pages/public/PasswordRecoveryPage') },
  { path: '/articles', load: () => import('../pages/public/ArticleListPage') },
  { path: '/article/:slug', load: () => import('../pages/public/ArticleDetailPage') },
  { path: '/categories', load: () => import('../pages/public/CategoriesPage') },
  { path: '/category/:slug', load: () => import('../pages/public/CategoryPage') },
  { path: '/authors', load: () => import('../pages/public/AuthorsPage') },
  { path: '/live', load: () => import('../pages/public/LivePage') },
  { path: '/live/:id', load: () => import('../pages/public/LivePage') },
  { path: '/live-sports', load: () => import('../pages/public/LiveSportsPage') },
  { path: '/weather', load: () => import('../pages/public/WeatherPage') },
  { path: '/radio', load: () => import('../pages/public/RadioPage') },
  { path: '/search', load: () => import('../pages/public/SearchPage') },
  { path: '/library', load: () => import('../pages/public/MyLibraryPage') },
  { path: '/about', load: () => import('../pages/public/AboutPage') },
  { path: '/contact', load: () => import('../pages/public/ContactPage') },
  { path: '/editorial-policy', load: () => import('../pages/public/EditorialPolicyPage') },
  { path: '/corrections', load: () => import('../pages/public/CorrectionsPage') },
  { path: '/advertising', load: () => import('../pages/public/AdvertisingPage') },
  { path: '/privacy', load: () => import('../pages/public/PrivacyPage') },
  { path: '/cookies', load: () => import('../pages/public/CookiePolicyPage') },
  { path: '/disclaimer', load: () => import('../pages/public/DisclaimerPage') },
  { path: '/terms', load: () => import('../pages/public/TermsPage') },
  { path: '/user/:id', load: () => import('../pages/public/UserProfilePage') },
  { path: '/:section', load: () => import('../pages/public/SectionPage') },
  { path: '/:section/:sub', load: () => import('../pages/public/SectionPage') },
  { path: '/writer/dashboard', load: () => import('../pages/writer/WriterDashboardPage') },
  { path: '/writer/articles', load: () => import('../pages/writer/WriterArticlesPage') },
  { path: '/writer/articles/new', load: () => import('../pages/writer/WriterArticleEditorPage') },
  { path: '/writer/articles/:id/edit', load: () => import('../pages/writer/WriterArticleEditorPage') },
  { path: '/writer/earnings', load: () => import('../pages/writer/WriterEarningsPage') },
  { path: '/writer/profile', load: () => import('../pages/public/UserProfilePage') },
  { path: '/editor/dashboard', load: () => import('../pages/editor/EditorDashboardPage') },
  { path: '/editor/pending', load: () => import('../pages/editor/EditorQueuePage') },
  { path: '/editor/comments', load: () => import('../pages/editor/EditorCommentsPage') },
  { path: '/editor/articles/:id', load: () => import('../pages/editor/EditorReviewPage') },
  { path: '/editor/articles', load: () => import('../pages/writer/WriterArticlesPage') },
  { path: '/editor/articles/new', load: () => import('../pages/writer/WriterArticleEditorPage') },
  { path: '/editor/articles/:id/edit', load: () => import('../pages/writer/WriterArticleEditorPage') },
  { path: '/editor/earnings', load: () => import('../pages/writer/WriterEarningsPage') },
  { path: '/editor/profile', load: () => import('../pages/public/UserProfilePage') },
  { path: '/mugishaimekevin', load: () => import('../pages/dashboard/DashboardPage') },
  { path: '/mugishaimekevin/login', load: () => import('../pages/admin/AdminLoginPage') },
  { path: '/mugishaimekevin/dashboard', load: () => import('../pages/dashboard/DashboardPage') },
  { path: '/mugishaimekevin/users', load: () => import('../pages/admin/AdminUsersPage') },
  { path: '/mugishaimekevin/writers', load: () => import('../pages/admin/AdminWritersPage') },
  { path: '/mugishaimekevin/users/:id', load: () => import('../pages/admin/AdminUserDetailPage') },
  { path: '/mugishaimekevin/articles', load: () => import('../pages/admin/AdminArticlesPage') },
  { path: '/mugishaimekevin/ai-writer', load: () => import('../pages/admin/AdminAiWriterPage') },
  { path: '/mugishaimekevin/payouts', load: () => import('../pages/admin/AdminPayoutsPage') },
  { path: '/mugishaimekevin/messages', load: () => import('../pages/admin/AdminMessagesPage') },
  { path: '/mugishaimekevin/categories', load: () => import('../pages/admin/AdminCategoriesPage') },
  { path: '/mugishaimekevin/advertising', load: () => import('../pages/admin/AdminAdsPage') },
  { path: '/mugishaimekevin/settings', load: () => import('../pages/admin/AdminSettingsPage') },
]

function pathIsFor(pattern: string, pathname: string): boolean {
  if (!pattern.includes(':')) return pattern === pathname
  const wanted = pattern.split('/').filter(Boolean)
  const asked = pathname.split('/').filter(Boolean)
  if (wanted.length !== asked.length) return false
  return wanted.every((part, index) => part.startsWith(':') || part === asked[index])
}

/** Ask for the page behind an address, if it is one that arrives in its own piece. */
function preloadPage(pathname: string): void {
  const entry =
    PAGE_LOADERS.find((page) => !page.path.includes(':') && page.path === pathname) ||
    PAGE_LOADERS.find((page) => page.path.includes(':') && pathIsFor(page.path, pathname))
  // A page that is already loaded settles at once, and a file that will not
  // arrive - an address that is not here, a dead network - is not worth telling
  // the reader about. Either way the navigation itself is untouched.
  if (entry) void entry.load().catch(() => {})
}

/**
 * Hovers, touches and keyboard focus all start the same fetch: the point is to
 * ask a moment before the reader commits, not to guess which of the three they
 * will use. Nothing here decides where the reader goes; a link they never tap
 * costs one file that sits unused in the cache.
 */
function RoutePrefetcher() {
  const location = useLocation()
  const here = `${location.pathname}${location.search}`
  useEffect(() => {
    const pathnameFor = (event: Event): string => {
      const anchor = (event.target as Element | null)?.closest?.('a')
      if (!anchor) return ''
      if (anchor.target && anchor.target !== '_self') return ''
      const href = anchor.getAttribute('href') || ''
      // Only this site's own pages, and only the address: a query string is the
      // same page with different words in the box.
      if (!href.startsWith('/') || href.startsWith('//')) return ''
      return href.split('?')[0].split('#')[0]
    }
    const onPointer = (event: Event) => {
      const anchor = (event.target as Element | null)?.closest?.('a')
      const pathname = pathnameFor(event)
      if (pathname) preloadPage(pathname)
      // The press, not the arrival, is when the reader starts waiting. A phone
      // has no hover to fetch the page with, so this is the first moment the
      // next screen's JavaScript is asked for - and the bar opens with it,
      // climbing over the page they are still looking at until the new one is
      // ready underneath it.
      const full = anchor?.getAttribute('href') || ''
      if (event.type === 'pointerdown' && pathname && full !== here) holdNavigation()
    }
    document.addEventListener('pointerover', onPointer, { passive: true })
    document.addEventListener('pointerdown', onPointer, { passive: true })
    document.addEventListener('focusin', onPointer, { passive: true })
    return () => {
      document.removeEventListener('pointerover', onPointer)
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('focusin', onPointer)
    }
  }, [here])

  return null
}

// A staff page asked for before the site knows who is reading it has to wait one
// request to find out. It waits quietly: the shapes below are where the desk
// appears, and the bar across the top is already answering the click that got
// the reader here. A page that said"Restoring your session…" in the middle of
// the screen was a second loader telling the reader nothing they could act on.
function SessionRestoring() {
  return (
    <div className="min-h-64 space-y-4 py-10" aria-hidden="true">
      <SkeletonBlock lines={2} className="max-w-md" />
      <SkeletonBlock lines={3} className="max-w-2xl" />
      <SkeletonBlock lines={3} className="max-w-2xl" />
    </div>
  )
}

function RequireRole({ children }: { role?: 'WRITER'; children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <SessionRestoring />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  // An ADMIN or EDITOR already writes; a READER has to be approved first.
  if (user.role === 'WRITER' || user.role === 'EDITOR' || user.role === 'ADMIN') return children
  return <WriterAccessGate />
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <SessionRestoring />
  if (!user) return <Navigate to="/mugishaimekevin/login" replace />
  if (user.role !== 'ADMIN') return <Navigate to={user.role === 'WRITER' ? '/writer/dashboard' : '/'} replace />
  return children
}

// The review desk is for the two roles that are allowed to decide what readers
// see. A READER or an unapproved WRITER is sent to their own area instead of a
// blank page, and the API refuses the same request independently of this gate.
function RequireStaff({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <SessionRestoring />
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'EDITOR' && user.role !== 'ADMIN') {
    return <Navigate to={user.role === 'WRITER' ? '/writer/dashboard' : '/'} replace />
  }
  return children
}

// Readers who click a story from the footer were left wherever they had scrolled
// on the previous page, so each new page opens at the top and back/forward still
// returns them to the spot they left.
// Readers never reload a page here, so Google Analytics has to hear about every
// route change itself.
function usePageViews() {
  const { pathname, search } = useLocation()
  useEffect(() => {
    trackPageView(`${pathname}${search}`)
  }, [pathname, search])
}

// A topic link published before the section tree existed still works. The old
// /category/<slug> address forwards to the section page when the spelling belongs
// to the tree, and stays on the topic page when the admin made it themselves.
function CategorySectionRoute() {
  const { slug = '' } = useParams<{ slug: string }>()
  const href = sectionHrefFor({ slug })
  if (href) return <Navigate to={href} replace />
  return <CategoryPage />
}

function RootLayout() {
  usePageViews()
  return (
    <>
      <RouteProgressBar />
      <RoutePrefetcher />
      <OfflineNotice />
      {/* A page that falls over must not take the rest of the site with it:
          the boundary below turns the crash into a readable card, and the
          reader keeps the bar they came in on. */}
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
      <ScrollRestoration />
    </>
  )
}

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    // Every page here is downloaded when it is asked for, so the router is the
    // first place a dead network shows up. Its built-in screen is the wall of
    // red text readers reported as"the react error"; this replaces it.
    errorElement: <RouteErrorScreen />,
    children: [
      {
        path: '/',
        element: <PublicLayout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'login', element: <AuthPage mode="login" /> },
          { path: 'register', element: <AuthPage mode="register" /> },
          // Password recovery lives beside the sign-in form rather than inside
          // it, because the reader arrives here already locked out and the page
          // has to stay standing on its own in a bookmark or a mail.
          { path: 'forgot-password', element: <PasswordRecoveryPage /> },
          { path: 'articles', element: <ArticleListPage /> },
          { path: 'article/:slug', element: <ArticleDetailPage /> },
          { path: 'categories', element: <CategoriesPage /> },
          // The authors directory. A static name, so it is matched before the
          // section routes below and cannot be mistaken for a beat slug.
          { path: 'authors', element: <AuthorsPage /> },
          { path: 'live', element: <LivePage /> },
          { path: 'live/:id', element: <LivePage /> },
          // The scores desk. Its own address rather than /sports/... because a
          // reader looking for a score is looking for the score, not for a
          // section of the archive, and because the name a search engine indexes
          // has to be the one on the tin.
          { path: 'live-sports', element: <LiveSportsPage /> },
          // RADAR Weather. Its own address because the owner indexes it himself,
          // and because a reader who wants the rain is not looking for a section
          // of the archive.
          { path: 'weather', element: <WeatherPage /> },
          // RADAR Audio: the stories read aloud. A page, not a fake station.
          { path: 'radio', element: <RadioPage /> },
          { path: 'category/:slug', element: <CategorySectionRoute /> },
          { path: 'search', element: <SearchPage /> },
          { path: 'library', element: <MyLibraryPage /> },
          { path: 'about', element: <AboutPage /> },
          { path: 'contact', element: <ContactPage /> },
          { path: 'editorial-policy', element: <EditorialPolicyPage /> },
          { path: 'corrections', element: <CorrectionsPage /> },
          { path: 'advertising', element: <AdvertisingPage /> },
          { path: 'privacy', element: <PrivacyPage /> },
          { path: 'cookies', element: <CookiePolicyPage /> },
          { path: 'disclaimer', element: <DisclaimerPage /> },
          { path: 'terms', element: <TermsPage /> },
          { path: 'user/:id', element: <UserProfilePage /> },
          { path: ':section', element: <SectionPage /> },
          { path: ':section/:sub', element: <SectionPage /> },
        ],
      },
      {
        path: '/writer',
        element: <WriterLayout variant="writer" />,
        children: [
          { index: true, element: <Navigate to="dashboard" replace /> },
          { path: 'dashboard', element: <RequireRole role="WRITER"><WriterDashboardPage /></RequireRole> },
          { path: 'articles', element: <RequireRole role="WRITER"><WriterArticlesPage /></RequireRole> },
          { path: 'articles/new', element: <RequireRole role="WRITER"><WriterArticleEditorPage /></RequireRole> },
          { path: 'articles/:id/edit', element: <RequireRole role="WRITER"><WriterArticleEditorPage /></RequireRole> },
          { path: 'earnings', element: <RequireRole role="WRITER"><WriterEarningsPage /></RequireRole> },
          { path: 'profile', element: <RequireRole role="WRITER"><UserProfilePage /></RequireRole> },
        ],
      },
      {
        path: '/editor',
        element: <WriterLayout variant="editor" />,
        children: [
          { index: true, element: <Navigate to="dashboard" replace /> },
          { path: 'dashboard', element: <RequireStaff><EditorDashboardPage /></RequireStaff> },
          { path: 'pending', element: <RequireStaff><EditorQueuePage /></RequireStaff> },
          { path: 'comments', element: <RequireStaff><EditorCommentsPage /></RequireStaff> },
          { path: 'articles/:id', element: <RequireStaff><EditorReviewPage /></RequireStaff> },
          // An editor writes too, and their own shelf is the same screen a
          // writer uses; only the review desk above is a separate address.
          { path: 'articles', element: <RequireStaff><WriterArticlesPage /></RequireStaff> },
          { path: 'articles/new', element: <RequireStaff><WriterArticleEditorPage /></RequireStaff> },
          { path: 'articles/:id/edit', element: <RequireStaff><WriterArticleEditorPage /></RequireStaff> },
          { path: 'earnings', element: <RequireStaff><WriterEarningsPage /></RequireStaff> },
          { path: 'profile', element: <RequireStaff><UserProfilePage /></RequireStaff> },
        ],
      },
      {
        path: '/mugishaimekevin',
        element: <AdminLayout />,
        children: [
          { index: true, element: <Navigate to="dashboard" replace /> },
          { path: 'dashboard', element: <RequireAdmin><DashboardPage kind="admin" /></RequireAdmin> },
          { path: 'users', element: <RequireAdmin><AdminUsersPage /></RequireAdmin> },
          { path: 'writers', element: <RequireAdmin><AdminWritersPage /></RequireAdmin> },
          { path: 'users/:id', element: <RequireAdmin><AdminUserDetailPage /></RequireAdmin> },
          { path: 'articles', element: <RequireAdmin><AdminArticlesPage /></RequireAdmin> },
          { path: 'ai-writer', element: <RequireAdmin><AdminAiWriterPage /></RequireAdmin> },
          { path: 'payouts', element: <RequireAdmin><AdminPayoutsPage /></RequireAdmin> },
          { path: 'messages', element: <RequireAdmin><AdminMessagesPage /></RequireAdmin> },
          // The desk that owns the sections. It used to point at the reader's
          // /categories page, which shows what exists but lets nobody change it.
          { path: 'categories', element: <RequireAdmin><AdminCategoriesPage /></RequireAdmin> },
          // The desk that sells the advertising spaces. Separate from the reader's
          // /advertising page, which only explains what is for sale.
          { path: 'advertising', element: <RequireAdmin><AdminAdsPage /></RequireAdmin> },
          { path: 'settings', element: <RequireAdmin><AdminSettingsPage /></RequireAdmin> },
        ],
      },
      // The admin sign-in sits outside every layout, so it is the one route that
      // carries its own boundary instead of borrowing the layout's.
      { path: '/mugishaimekevin/login', element: <DelayedPage><AdminLoginPage /></DelayedPage> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
