import { createBrowserRouter, Navigate, Outlet, ScrollRestoration, useLocation, useParams } from 'react-router-dom'
import { type ReactNode, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { sectionHrefFor } from '../data/sections'
import { trackPageView } from '../utils/analytics'
import RouteProgressBar from '../components/common/RouteProgressBar'
import WriterAccessGate from '../components/auth/WriterAccessGate'
import AdminLayout from '../layouts/AdminLayout'
import PublicLayout from '../layouts/PublicLayout'
import WriterLayout from '../layouts/WriterLayout'
import AuthPage from '../pages/public/AuthPage'
import ArticleDetailPage from '../pages/public/ArticleDetailPage'
import ArticleListPage from '../pages/public/ArticleListPage'
import CategoriesPage from '../pages/public/CategoriesPage'
import CategoryPage from '../pages/public/CategoryPage'
import HomePage from '../pages/public/HomePage'
import LivePage from '../pages/public/LivePage'
import LiveSportsPage from '../pages/public/LiveSportsPage'
import MyLibraryPage from '../pages/public/MyLibraryPage'
import RadioPage from '../pages/public/RadioPage'
import SearchPage from '../pages/public/SearchPage'
import SectionPage from '../pages/public/SectionPage'
import AboutPage from '../pages/public/AboutPage'
import AdvertisingPage from '../pages/public/AdvertisingPage'
import ContactPage from '../pages/public/ContactPage'
import CorrectionsPage from '../pages/public/CorrectionsPage'
import EditorialPolicyPage from '../pages/public/EditorialPolicyPage'
import PrivacyPage from '../pages/public/PrivacyPage'
import TermsPage from '../pages/public/TermsPage'
import CookiePolicyPage from '../pages/public/CookiePolicyPage'
import DisclaimerPage from '../pages/public/DisclaimerPage'
import UserProfilePage from '../pages/public/UserProfilePage'
import WriterDashboardPage from '../pages/writer/WriterDashboardPage'
import WriterArticlesPage from '../pages/writer/WriterArticlesPage'
import WriterArticleEditorPage from '../pages/writer/WriterArticleEditorPage'
import WriterEarningsPage from '../pages/writer/WriterEarningsPage'
import EditorDashboardPage from '../pages/editor/EditorDashboardPage'
import EditorQueuePage from '../pages/editor/EditorQueuePage'
import EditorCommentsPage from '../pages/editor/EditorCommentsPage'
import EditorReviewPage from '../pages/editor/EditorReviewPage'
import DashboardPage from '../pages/dashboard/DashboardPage'
import AdminLoginPage from '../pages/admin/AdminLoginPage'
import AdminUsersPage from '../pages/admin/AdminUsersPage'
import AdminWritersPage from '../pages/admin/AdminWritersPage'
import AdminUserDetailPage from '../pages/admin/AdminUserDetailPage'
import AdminArticlesPage from '../pages/admin/AdminArticlesPage'
import AdminAiWriterPage from '../pages/admin/AdminAiWriterPage'
import AdminPayoutsPage from '../pages/admin/AdminPayoutsPage'
import AdminMessagesPage from '../pages/admin/AdminMessagesPage'
import AdminCategoriesPage from '../pages/admin/AdminCategoriesPage'
import AdminAdsPage from '../pages/admin/AdminAdsPage'
import AdminSettingsPage from '../pages/admin/AdminSettingsPage'

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
      { path: '/mugishaimekevin/login', element: <AdminLoginPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
