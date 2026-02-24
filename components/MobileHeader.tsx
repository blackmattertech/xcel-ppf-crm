'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { SIDEBAR_MENU_ITEMS, type SidebarMenuItem } from '@/shared/constants/sidebar'
import { X, LogOut, Bell, Plus } from 'lucide-react'
import { useAuthContext } from './AuthProvider'

interface MobileHeaderProps {
  title: string
  showAddButton?: boolean
  onAddClick?: () => void
  showNotifications?: boolean
}

export default function MobileHeader({ 
  title, 
  showAddButton = false, 
  onAddClick,
  showNotifications = true 
}: MobileHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { loading, userId, role, profile } = useAuthContext()
  const userRole = role?.name ?? null
  const userPermissions = role?.permissions ?? []
  const menuRef = useRef<HTMLDivElement>(null)

  // Filter menu items based on permissions (same logic as Sidebar)
  const filteredMenuItems = SIDEBAR_MENU_ITEMS.filter((item) => {
    const roleLower = userRole?.toLowerCase() ?? ''
    if (roleLower === 'super_admin' || roleLower === 'admin') return true
    if (!item.requiresPermissions) return true
    if (item.roles && userRole && item.roles.some((r) => r.toLowerCase() === roleLower)) return true
    const hasReadPermission = userPermissions.includes(`${item.resource}.read`)
    const hasManagePermission = userPermissions.includes(`${item.resource}.manage`)
    return hasReadPermission || hasManagePermission
  })

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMobileMenuOpen(false)
      }
    }

    if (mobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [mobileMenuOpen])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <>
      {/* Mobile Header */}
      <div className="md:hidden bg-black border-b border-[#272727] h-[65px] flex items-center justify-between px-5 fixed top-0 left-0 right-0 z-40">
        <button 
          onClick={() => setMobileMenuOpen(true)}
          className="p-2"
        >
          <svg width="19" height="19" viewBox="0 0 19 19" fill="none">
            <path d="M2.375 4.75H16.625M2.375 9.5H16.625M2.375 14.25H16.625" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        <h1 className="text-white text-base font-medium tracking-[0.3px]">{title}</h1>
        <div className="flex items-center gap-2">
          {showAddButton && onAddClick && (
            <button 
              onClick={onAddClick}
              className="w-8 h-8 rounded-full bg-[#ed1b24] flex items-center justify-center"
            >
              <Plus size={16} className="text-white" />
            </button>
          )}
          {showNotifications && (
            <button className="p-2">
              <Bell size={18} className="text-white" />
            </button>
          )}
          {profile?.profileImageUrl ? (
            <Image
              src={profile.profileImageUrl}
              alt={profile.name || 'User'}
              width={33}
              height={33}
              className="w-[33px] h-[33px] rounded-full object-cover"
            />
          ) : (
            <div className="w-[33px] h-[33px] rounded-full bg-gray-600 flex items-center justify-center text-white text-xs font-medium">
              {profile?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
          )}
        </div>
      </div>

      {/* Hamburger Menu Drawer */}
      {mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => setMobileMenuOpen(false)}
          />
          {/* Drawer */}
          <div ref={menuRef} className="fixed top-0 left-0 h-full bg-black z-50 overflow-y-auto" style={{ width: `${Math.min(320, Math.max(280, filteredMenuItems.length * 50 + 100))}px` }}>
            <div className="p-4 border-b border-[#272727] flex items-center justify-between">
              <h2 className="text-white text-lg font-semibold">Menu</h2>
              <button 
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-white"
              >
                <X size={24} />
              </button>
            </div>
            <nav className="p-2">
              {filteredMenuItems.map((item) => {
                const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-colors ${
                      isActive 
                        ? 'bg-[#ed1b24] text-white' 
                        : 'text-gray-300 hover:bg-gray-800'
                    }`}
                  >
                    {item.iconPath ? (
                      <Image
                        src={item.iconPath}
                        alt={item.name}
                        width={24}
                        height={24}
                        className="w-6 h-6"
                      />
                    ) : (
                      <span className="text-xl">{item.icon}</span>
                    )}
                    <span className="text-base font-medium">{item.name}</span>
                  </Link>
                )
              })}
            </nav>
            {/* Logout Button */}
            <div className="p-4 border-t border-[#272727] mt-auto">
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 hover:bg-gray-800 w-full transition-colors"
              >
                <LogOut size={24} />
                <span className="text-base font-medium">Logout</span>
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
