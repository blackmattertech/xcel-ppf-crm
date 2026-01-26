'use client'

import { ReactNode, useState, useEffect } from 'react'
import Sidebar from './Sidebar'
import FollowUpNotifications from './FollowUpNotifications'
import PopupNotification from './PopupNotification'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  // Load collapsed state from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebar-collapsed')
      if (saved === 'true') {
        setIsCollapsed(true)
      }
    }
  }, [])

  // Listen for sidebar collapse changes via custom event
  useEffect(() => {
    const handleSidebarToggle = (e: CustomEvent) => {
      setIsCollapsed(e.detail.isCollapsed)
    }
    
    window.addEventListener('sidebar-toggle' as any, handleSidebarToggle as EventListener)
    return () => {
      window.removeEventListener('sidebar-toggle' as any, handleSidebarToggle as EventListener)
    }
  }, [])

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className={`flex-1 overflow-x-hidden transition-all duration-300 ${isCollapsed ? 'ml-16' : 'ml-60'}`}>
        <FollowUpNotifications />
        {children}
        <PopupNotification />
      </main>
    </div>
  )
}
