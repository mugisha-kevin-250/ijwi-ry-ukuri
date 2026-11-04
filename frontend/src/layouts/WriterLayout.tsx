import { Outlet } from 'react-router-dom'
import Header from '../components/layout/Header'
import Sidebar from '../components/layout/Sidebar'
import { useState } from 'react'

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
          <Outlet />
        </main>
      </div>
    </div>
  )
}