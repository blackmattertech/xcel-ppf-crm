'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useFollowUpNotifications } from '@/hooks/useFollowUpNotifications'
import { SIDEBAR_MENU_ITEMS, type SidebarMenuItem } from '@/shared/constants/sidebar'

// Use the centralized sidebar configuration
const menuItems: SidebarMenuItem[] = SIDEBAR_MENU_ITEMS

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, isLoading, isAuthenticated } = useAuth()
  
  // Only fetch follow-up notifications if user is a tele_caller
  const { data: followUpData } = useFollowUpNotifications(
    user?.role === 'tele_caller'
  )

  // Redirect to login if not authenticated
  if (!isLoading && !isAuthenticated) {
    router.push('/login')
    return null
  }

  const userRole = user?.role || null
  const userName = user?.name || ''
  const userPermissions = user?.permissions || []
  const followUpCount = followUpData?.totalPending || 0

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Filter menu items based on user role and permissions
  const filteredMenuItems = menuItems.filter((item) => {
    // If item doesn't require permissions, show it to all authenticated users
    if (!item.requiresPermissions) {
      return true
    }

    // Check if user's role is explicitly allowed
    if (item.roles && userRole && item.roles.includes(userRole)) {
      return true
    }

    // Check if user has permission for this resource
    // User needs either {resource}.read or {resource}.manage permission
    const hasReadPermission = userPermissions.includes(`${item.resource}.read`)
    const hasManagePermission = userPermissions.includes(`${item.resource}.manage`)
    
    if (hasReadPermission || hasManagePermission) {
      return true
    }

    // If item has roles restriction and user doesn't have permission, hide it
    return false
  })

  if (isLoading) {
    return (
      <div className="fixed left-0 top-0 w-64 h-screen bg-gray-900 flex items-center justify-center z-50">
        <div className="text-white">Loading...</div>
      </div>
    )
  }

  return (
    <div className="fixed left-0 top-0 w-64 h-screen bg-gray-900 flex flex-col z-50 overflow-y-auto">
      {/* Logo/Brand */}
      <div className="p-6 border-b border-gray-800 flex-shrink-0">
        <h1 className="text-xl font-bold text-white">Xcel CRM</h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {filteredMenuItems.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
          const showBadge = item.href === '/leads' && userRole === 'tele_caller' && followUpCount > 0
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-3">
                <span className="text-xl">{item.icon}</span>
                <span className="font-medium">{item.name}</span>
              </div>
              {showBadge && (
                <span className={`px-2 py-1 text-xs font-bold rounded-full ${
                  isActive 
                    ? 'bg-red-500 text-white' 
                    : 'bg-red-600 text-white'
                }`}>
                  {followUpCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* User Info & Logout */}
      <div className="p-4 border-t border-gray-800 flex-shrink-0">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-semibold">
            {userName ? userName.charAt(0).toUpperCase() : 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{userName}</p>
            <p className="text-xs text-gray-400 capitalize">
              {userRole?.replace('_', ' ') || 'User'}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 hover:text-white transition-colors"
        >
          <span>🚪</span>
          <span>Logout</span>
        </button>
      </div>
    </div>
  )
}
