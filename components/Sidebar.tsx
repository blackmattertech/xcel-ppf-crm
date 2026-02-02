'use client'

import { useEffect, useState, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { SIDEBAR_MENU_ITEMS, type SidebarMenuItem } from '@/shared/constants/sidebar'
import { ChevronLeft, ChevronRight, LogOut, User, Settings as SettingsIcon } from 'lucide-react'
import { useAuthContext } from './AuthProvider'

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { loading, userId, role, profile } = useAuthContext()
  const userRole = role?.name ?? null
  const userPermissions = role?.permissions ?? []
  const [followUpCount, setFollowUpCount] = useState(0)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)

  // Load collapsed state from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebar-collapsed')
      if (saved === 'true') {
        setIsCollapsed(true)
      }
    }
  }, [])

  // Save collapsed state to localStorage and notify Layout
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('sidebar-collapsed', String(isCollapsed))
      // Dispatch custom event to notify Layout
      window.dispatchEvent(new CustomEvent('sidebar-toggle', { detail: { isCollapsed } }))
    }
  }, [isCollapsed])

  useEffect(() => {
    if (userRole === 'tele_caller') {
      fetchFollowUpCount()
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

  // Close profile menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false)
      }
    }

    if (showProfileMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showProfileMenu])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Filter menu items based on user role and permissions
  const filteredMenuItems = SIDEBAR_MENU_ITEMS.filter((item) => {
    // Super admin and admin can see all items
    if (userRole === 'super_admin' || userRole === 'admin') {
      return true
    }

    // Items that don't require permissions are visible to all authenticated users
    if (!item.requiresPermissions) {
      return true
    }

    // If item has specific roles, check if user role matches
    if (item.roles && userRole && item.roles.includes(userRole)) {
      return true
    }

    // Check if user has required permissions
    const hasReadPermission = userPermissions.includes(`${item.resource}.read`)
    const hasManagePermission = userPermissions.includes(`${item.resource}.manage`)
    
    if (hasReadPermission || hasManagePermission) {
      return true
    }

    return false
  })

  const sidebarWidth = isCollapsed ? 'w-16' : 'w-60'

  // Get user name with fallback to email or role name
  const userName = profile?.name?.trim() || profile?.email?.split('@')[0] || (userRole ? userRole.replace('_', ' ') : 'User')
  const userEmail = profile?.email || ''
  const userProfileImage = profile?.profileImageUrl || null

  return (
    <div className={`fixed left-0 top-0 h-screen bg-black flex flex-col z-50 overflow-hidden transition-all duration-300 ${sidebarWidth} border-r border-gray-800`}>
      {/* Logo/Brand Section */}
      <div className={`p-4 border-b border-gray-800 flex-shrink-0 flex items-center ${isCollapsed ? 'justify-center' : 'justify-start'}`}>
        {isCollapsed ? (
          <div className="flex items-center justify-center">
            <Image
              src="/image.png"
              alt="XCEL Logo"
              width={80}
              height={49}
              className="object-contain"
              style={{ width: 'auto', height: 'auto' }}
              priority
            />
          </div>
        ) : (
          <div className="flex items-center justify-start">
            <Image
              src="/image.png"
              alt="XCEL Logo"
              width={180}
              height={111}
              className="object-contain"
              style={{ width: 'auto', height: 'auto' }}
              priority
            />
          </div>
        )}
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto scrollbar-hide">
        {loading ? (
          // Lightweight skeleton while auth/user data resolves.
          Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className={`flex items-center ${isCollapsed ? 'justify-center px-2' : 'justify-start px-4'} py-3 rounded-lg bg-gray-900/60 animate-pulse`}
            >
              <div className="w-6 h-6 rounded-full bg-gray-700" />
              {!isCollapsed && <div className="ml-3 h-3 w-24 rounded bg-gray-700" />}
            </div>
          ))
        ) : filteredMenuItems.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
          const showBadge = item.href === '/leads' && userRole === 'tele_caller' && followUpCount > 0
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex items-center ${isCollapsed ? 'justify-center px-2' : 'justify-start px-4'} py-3 rounded-lg transition-all group ${
                isActive
                  ? 'bg-[#242d35] text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
              title={isCollapsed ? item.name : undefined}
            >
              {/* Active indicator bar */}
              {isActive && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-[#de0510] rounded-l" />
              )}
              
              {/* Icon */}
              <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
                {item.iconPath ? (
                  item.iconPath.endsWith('.svg') ? (
                    <img
                      src={item.iconPath}
                      alt={item.name}
                      className="opacity-90 w-6 h-6 object-contain"
                      style={{ maxWidth: '24px', maxHeight: '24px' }}
                    />
                  ) : (
                    <Image
                      src={item.iconPath}
                      alt={item.name}
                      width={24}
                      height={24}
                      className="opacity-90 object-contain"
                      style={{ width: 'auto', height: 'auto', maxWidth: '24px', maxHeight: '24px' }}
                    />
                  )
                ) : (
                <span className="text-xl">{item.icon}</span>
                )}
              </div>
              
              {/* Label */}
              {!isCollapsed && (
                <>
                  <span className="ml-3 font-medium text-base flex-1">{item.name}</span>
              {showBadge && (
                <span className={`px-2 py-1 text-xs font-bold rounded-full ${
                  isActive 
                        ? 'bg-[#de0510] text-white' 
                        : 'bg-[#de0510] text-white'
                }`}>
                  {followUpCount}
                </span>
                  )}
                </>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Bottom Section - Logout, Settings & Help */}
      <div className="border-t border-gray-800 flex-shrink-0">
        <div className="p-2 space-y-1">
          {/* Logout Button - Above Settings */}
          <button
            onClick={handleLogout}
            className={`w-full flex items-center ${isCollapsed ? 'justify-center px-2' : 'justify-start px-4'} py-3 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-colors`}
            title={isCollapsed ? 'Logout' : undefined}
          >
            <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
              <LogOut size={20} className="opacity-90" />
            </div>
            {!isCollapsed && <span className="ml-3 font-medium text-base">Logout</span>}
          </button>
          
          {/* Divider line */}
          <div className="border-t border-gray-800 my-1" />
          
          <Link
            href="/settings"
            className={`flex items-center ${isCollapsed ? 'justify-center px-2' : 'justify-start px-4'} py-3 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-colors`}
            title={isCollapsed ? 'Settings' : undefined}
          >
            <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
              <img
                src="/assets/sidebar/settings.svg"
                alt="Settings"
                className="opacity-90 w-6 h-6 object-contain"
                style={{ maxWidth: '24px', maxHeight: '24px' }}
              />
            </div>
            {!isCollapsed && <span className="ml-3 font-medium text-base">Settings</span>}
          </Link>
          <Link
            href="/help"
            className={`flex items-center ${isCollapsed ? 'justify-center px-2' : 'justify-start px-4'} py-3 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-colors`}
            title={isCollapsed ? 'Help center' : undefined}
          >
            <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
              <img
                src="/assets/sidebar/help.svg"
                alt="Help"
                className="opacity-90 w-6 h-6 object-contain"
                style={{ maxWidth: '24px', maxHeight: '24px' }}
              />
            </div>
            {!isCollapsed && <span className="ml-3 font-medium text-base">Help center</span>}
          </Link>
        </div>
      </div>

      {/* User Profile Section */}
      <div className="border-t border-gray-800 flex-shrink-0 p-6">
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-4'}`}>
          {/* Avatar - Clickable */}
          <div className="flex-shrink-0 relative" ref={profileMenuRef}>
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="relative focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:ring-offset-2 focus:ring-offset-black rounded-full transition-transform hover:scale-105"
              aria-label="Profile menu"
            >
              {userProfileImage ? (
                <div className="relative">
                  <Image
                    src={userProfileImage}
                    alt={userName}
                    width={48}
                    height={48}
                    className="rounded-full object-cover border-2 border-gray-700 cursor-pointer"
                    onError={(e) => {
                      // Hide image on error and show fallback
                      const target = e.target as HTMLImageElement
                      target.style.display = 'none'
                      const parent = target.parentElement
                      if (parent) {
                        const fallback = document.createElement('div')
                        fallback.className = 'w-12 h-12 rounded-full bg-[#de0510] flex items-center justify-center text-white font-semibold text-base border-2 border-gray-700 cursor-pointer'
                        fallback.textContent = userName ? userName.charAt(0).toUpperCase() : 'U'
                        parent.appendChild(fallback)
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-full bg-[#de0510] flex items-center justify-center text-white font-semibold text-base border-2 border-gray-700 cursor-pointer">
                  {userName ? userName.charAt(0).toUpperCase() : 'U'}
                </div>
              )}
              {/* Online indicator */}
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-black" />
            </button>
            
            {/* Profile Dropdown Menu */}
            {showProfileMenu && (
              <div className={`absolute ${isCollapsed ? 'left-full ml-2 bottom-0' : 'bottom-full left-0 mb-2'} w-48 bg-white rounded-lg shadow-xl border border-gray-200 z-50 overflow-hidden`}>
                <div className="py-1">
                  <Link
                    href={userId ? `/admin/users/${userId}` : '/settings'}
                    onClick={() => setShowProfileMenu(false)}
                    className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    <User size={16} className="mr-3 text-gray-500" />
                    <span>Edit Profile</span>
                  </Link>
                  <button
                    onClick={() => {
                      setShowProfileMenu(false)
                      handleLogout()
                    }}
                    className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors text-left"
                  >
                    <LogOut size={16} className="mr-3 text-gray-500" />
                    <span>Logout</span>
                  </button>
                </div>
              </div>
            )}
          </div>
          
          {/* User Info */}
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{userName}</p>
              <p className="text-xs text-gray-400 truncate capitalize">
                {userRole ? userRole.replace('_', ' ') : 'User'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Collapse Toggle Button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute bottom-20 right-2 p-2 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors z-10"
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {isCollapsed ? (
          <ChevronRight size={16} />
        ) : (
          <ChevronLeft size={16} />
        )}
      </button>
    </div>
  )
}
