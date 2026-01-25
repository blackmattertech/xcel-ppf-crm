'use client'

import { ReactNode } from 'react'
import Sidebar from './Sidebar'
import FollowUpNotifications from './FollowUpNotifications'
import PopupNotification from './PopupNotification'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 ml-64 overflow-x-hidden">
        <FollowUpNotifications />
        {children}
        <PopupNotification />
      </main>
    </div>
  )
}
