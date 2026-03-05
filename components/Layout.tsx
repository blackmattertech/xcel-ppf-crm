'use client'

import { ReactNode, useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
import Sidebar from './Sidebar'
import MobileBottomNav from './MobileBottomNav'
import MobileHeader from './MobileHeader'
import { FollowupNotificationsProvider } from './FollowupNotificationsProvider'

// Notifications are still available via the popup, but the header banner
// is commented out for a cleaner layout on all pages.
const PopupNotification = dynamic(() => import('./PopupNotification'), {
  ssr: false,
})

interface LayoutProps {
  children: ReactNode
  mobileTitle?: string
  showMobileAddButton?: boolean
  onMobileAddClick?: () => void
}

export default function Layout({ 
  children, 
  mobileTitle,
  showMobileAddButton = false,
  onMobileAddClick 
}: LayoutProps) {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('sidebar-collapsed') === 'true'
  })
  const pathname = usePathname()

  // Initial collapsed state is derived from localStorage via lazy initializer

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

  // Get page title from pathname if not provided
  const getPageTitle = () => {
    if (mobileTitle) return mobileTitle
    const path = pathname?.split('/').pop() || 'Dashboard'
    return path.charAt(0).toUpperCase() + path.slice(1).replace(/-/g, ' ')
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Mobile Header - shown only on mobile */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40">
        <MobileHeader 
          title={getPageTitle()}
          showAddButton={showMobileAddButton}
          onAddClick={onMobileAddClick}
        />
      </div>
      
      {/* Sidebar - hidden on mobile */}
      <div className="hidden md:block">
        <Sidebar />
      </div>
      <FollowupNotificationsProvider>
        <main className={`flex-1 overflow-x-hidden transition-all duration-300 ${isCollapsed ? 'md:ml-16' : 'md:ml-60'} md:pt-0 pt-[65px] w-full`}>
          {/* <FollowUpNotifications /> */}
          {children}
          <PopupNotification />
        </main>
      </FollowupNotificationsProvider>
      {/* Mobile Bottom Navigation - shown only on mobile */}
      <MobileBottomNav />
    </div>
  )
}
