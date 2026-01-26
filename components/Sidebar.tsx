'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

import { SIDEBAR_MENU_ITEMS, type SidebarMenuItem } from '@/shared/constants/sidebar'

// Use the centralized sidebar configuration
const menuItems: SidebarMenuItem[] = SIDEBAR_MENU_ITEMS

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [userRole, setUserRole] = useState<string | null>(null)
  const [userName, setUserName] = useState<string>('')
  const [userPermissions, setUserPermissions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [followUpCount, setFollowUpCount] = useState(0)

  useEffect(() => {
    checkAuth()
  }, [])

  useEffect(() => {
    if (userRole === 'tele_caller') {
      fetchFollowUpCount()
      // Refresh count every 5 minutes
      const interval = setInterval(fetchFollowUpCount, 5 * 60 * 1000)
      return () => clearInterval(interval)
    }
  }, [userRole])

  async function fetchFollowUpCount() {
    try {
      const response = await fetch('/api/followups/notifications')
      if (response.ok) {
        const data = await response.json()
        setFollowUpCount(data.totalPending || 0)
      }
    } catch (error) {
      console.error('Failed to fetch follow-up count:', error)
    }
  }

  async function checkAuth() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
      return
    }

    // Fetch user data with role and permissions
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select(`
        name,
        role_id,
        roles!users_role_id_fkey (
          name,
          role_permissions (
            permissions (
              name
            )
          )
        )
      `)
      .eq('id', user.id)
      .single()

    if (userData) {
      setUserName(userData.name)
      
      // Extract role and permissions
      const roleData = (userData as any).roles
      if (roleData) {
        setUserRole(roleData.name)
        
        // Extract permissions from role_permissions
        const permissions = (roleData.role_permissions || [])
          .map((rp: any) => rp.permissions?.name)
          .filter(Boolean)
        
        setUserPermissions(permissions)
      }
    } else if (userError) {
      console.error('Error fetching user:', userError)
      // User exists in Auth but not in users table
      if (userError.code === 'PGRST116') {
        console.warn('User not found in database. Please run: npx tsx scripts/add-user-to-db.ts <your-email> "<your-name>" <role>')
      }
    }
    
    setLoading(false)
  }

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

  if (loading) {
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
