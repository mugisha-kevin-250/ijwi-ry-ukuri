import { Outlet } from 'react-router-dom'
import { Suspense, useState } from 'react'
import Header from '../components/layout/Header'
import Sidebar from '../components/layout/Sidebar'
import RouteFallback from '../components/common/RouteFallback'

interface WriterLayoutProps {
  variant: 'writer' | 'editor' | 'admin'
}

export default function WriterLayout({ variant = 'writer' }: WriterLayoutProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <a href="#staff-main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:font-bold focus:text-blue-800 focus:shadow-lg">Skip to main content</a>
      <Sidebar variant={variant} isCollapsed={isSidebarCollapsed} onCollapsedChange={setIsSidebarCollapsed} />
      <div className={`min-w-0 transition-[margin] duration-300 ${isSidebarCollapsed ? 'ml-0 md:ml-16' : 'ml-0 md:ml-64'}`}>
        <Header variant={variant} sidebarCollapsed={isSidebarCollapsed} />
        <main id="staff-main-content" tabIndex={-1} className="min-w-0 px-3 pb-8 pt-20 sm:px-4 lg:px-6">
          {/* The staff screens are the heavy ones - charts, the article editor,
              the live studio - and they are exactly what a reader never
              downloads. So each of them arrives on its own, here. */}
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}