import { createBrowserRouter, Navigate, Outlet, ScrollRestoration, useLocation } from 'react-router-dom'
import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
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
import SearchPage from '../pages/public/SearchPage'
import UserProfilePage from '../pages/public/UserProfilePage'
import WriterDashboardPage from '../pages/writer/WriterDashboardPage'
import WriterArticlesPage from '../pages/writer/WriterArticlesPage'
import WriterArticleEditorPage from '../pages/writer/WriterArticleEditorPage'
import WriterEarningsPage from '../pages/writer/WriterEarningsPage'
import DashboardPage from '../pages/dashboard/DashboardPage'
import AdminLoginPage from '../pages/admin/AdminLoginPage'
import AdminUsersPage from '../pages/admin/AdminUsersPage'
import AdminUserDetailPage from '../pages/admin/AdminUserDetailPage'
import AdminArticlesPage from '../pages/admin/AdminArticlesPage'
import AdminPayoutsPage from '../pages/admin/AdminPayoutsPage'
import AdminSettingsPage from '../pages/admin/AdminSettingsPage'

function RequireRole({ role, children }: { role: 'WRITER'; children: ReactNode }) {
  const { user, loading, becomeWriter } = useAuth()
  const location = useLocation()
  const [promotionError, setPromotionError] = useState<string | null>(null)
  // Signing up creates a READER; entering the writer area opens the writer account.
  const needsPromotion = role === 'WRITER' && !!user && user.role === 'READER'

  useEffect(() => {
    if (!needsPromotion) return
    let cancelled = false
    setPromotionError(null)
    becomeWriter().catch((err: any) => {
      if (!cancelled) setPromotionError(err.message || 'Could not open the writer account')
    })
    return () => { cancelled = true }
  }, [needsPromotion, becomeWriter])

  if (loading) return <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">Restoring your session…</div>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (needsPromotion) {
    if (promotionError) {
      return (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="text-sm font-semibold text-red-600">{promotionError}</p>
          <Navigate to="/" replace />
        </div>
      )
    }
    return <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">Opening your writer account…</div>
  }
  return children
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">Restoring your session…</div>
  if (!user) return <Navigate to="/mugishaimekevin/login" replace />
  if (user.role !== 'ADMIN') return <Navigate to={user.role === 'WRITER' ? '/writer/dashboard' : '/'} replace />
  return children
}

// Readers who click a story from the footer were left wherever they had scrolled
// on the previous page, so each new page opens at the top and back/forward still
// returns them to the spot they left.
function RootLayout() {
  return (
    <>
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
          { path: 'category/:slug', element: <CategoryPage /> },
          { path: 'search', element: <SearchPage /> },
          { path: 'user/:id', element: <UserProfilePage /> },
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
        path: '/mugishaimekevin',
        element: <AdminLayout />,
        children: [
          { index: true, element: <Navigate to="dashboard" replace /> },
          { path: 'dashboard', element: <RequireAdmin><DashboardPage kind="admin" /></RequireAdmin> },
          { path: 'users', element: <RequireAdmin><AdminUsersPage /></RequireAdmin> },
          { path: 'users/:id', element: <RequireAdmin><AdminUserDetailPage /></RequireAdmin> },
          { path: 'articles', element: <RequireAdmin><AdminArticlesPage /></RequireAdmin> },
          { path: 'payouts', element: <RequireAdmin><AdminPayoutsPage /></RequireAdmin> },
          { path: 'settings', element: <RequireAdmin><AdminSettingsPage /></RequireAdmin> },
        ],
      },
      { path: '/mugishaimekevin/login', element: <AdminLoginPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
