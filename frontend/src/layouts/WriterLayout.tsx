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
      <Sidebar variant={variant} isCollapsed={isSidebarCollapsed} onCollapsedChange={setIsSidebarCollapsed} />
      <div className={`transition-[margin] duration-300 ${isSidebarCollapsed ? 'ml-16' : 'ml-16 md:ml-64'}`}>
        <Header variant={variant} sidebarCollapsed={isSidebarCollapsed} />
        <main className="px-6 pb-8 pt-20">
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