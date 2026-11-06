import { Outlet, useLocation } from 'react-router-dom'
import Header from '../components/layout/Header'
import Footer from '../components/layout/Footer'
import BottomNav from '../components/layout/BottomNav'
import SignInPrompt from '../components/auth/SignInPrompt'

export default function PublicLayout() {
  const { pathname } = useLocation()

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950 pb-16 md:pb-0">
      <Header variant="public" />
      <main className="flex-1 pt-16">
        <Outlet />
      </main>
      {pathname !== '/' && <Footer />}
      <BottomNav />
      <SignInPrompt />
    </div>
  )
}