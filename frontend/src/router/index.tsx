import { createBrowserRouter, Navigate, Outlet, ScrollRestoration, useLocation, useParams } from 'react-router-dom'
import { type ReactNode, Suspense, lazy, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { sectionHrefFor } from '../data/sections'
import { trackPageView } from '../utils/analytics'
import RouteProgressBar from '../components/common/RouteProgressBar'
import RouteFallback from '../components/common/RouteFallback'
import WriterAccessGate from '../components/auth/WriterAccessGate'
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

function RequireRole({ children }: { role?: 'WRITER'; children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">Restoring your session…</div>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  // An ADMIN or EDITOR already writes; a READER has to be approved first.
  if (user.role === 'WRITER' || user.role === 'EDITOR' || user.role === 'ADMIN') return children
  return <WriterAccessGate />
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">Restoring your session…</div>
  if (!user) return <Navigate to="/mugishaimekevin/login" replace />
  if (user.role !== 'ADMIN') return <Navigate to={user.role === 'WRITER' ? '/writer/dashboard' : '/'} replace />
  return children
}

// The review desk is for the two roles that are allowed to decide what readers
// see. A READER or an unapproved WRITER is sent to their own area instead of a
// blank page, and the API refuses the same request independently of this gate.
function RequireStaff({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">Restoring your session…</div>
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
      <Outlet />
      <ScrollRestoration />
    </>
  )
}

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        path: '/',
        element: <PublicLayout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'login', element: <AuthPage mode="login" /> },
          { path: 'register', element: <AuthPage mode="register" /> },
          { path: 'articles', element: <ArticleListPage /> },
          { path: 'article/:slug', element: <ArticleDetailPage /> },
          { path: 'categories', element: <CategoriesPage /> },
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
