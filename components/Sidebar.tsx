'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

interface MenuItem {
  name: string
  href: string
  icon: string
  roles?: string[]
}

const menuItems: MenuItem[] = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: '/assets/icons/group-14.svg',
  },
  {
    name: 'Customers',
    href: '/customers',
    icon: '/assets/icons/group-15.svg',
  },
  {
    name: 'Leads',
    href: '/leads',
    icon: '/assets/icons/group-16.svg',
  },
  {
    name: 'Tasks & Followups',
    href: '/followups',
    icon: '/assets/icons/group-17.svg',
  },
  {
    name: 'Sales Pipeline',
    href: '/pipeline',
    icon: '/assets/icons/group-18.svg',
  },
  {
    name: 'Communication',
    href: '/communication',
    icon: '/assets/icons/group-19.svg',
  },
  {
    name: 'Marketing',
    href: '/marketing',
    icon: '/assets/icons/group-21.svg',
  },
  {
    name: 'Teams',
    href: '/teams',
    icon: '/assets/icons/group-22.svg',
  },
  {
    name: 'Reports',
    href: '/reports',
    icon: '/assets/icons/group-23.svg',
  },
  {
    name: 'Integrations',
    href: '/integrations',
    icon: '/assets/icons/group-24.svg',
  },
  {
    name: 'Roles & Permissions',
    href: '/admin/roles',
    icon: '/assets/icons/group-25.svg',
    roles: ['super_admin', 'admin'],
  },
  {
    name: 'User Management',
    href: '/admin/users',
    icon: '/assets/icons/group-25.svg',
    roles: ['super_admin', 'admin'],
  },
]

const bottomMenuItems: MenuItem[] = [
  {
    name: 'Settings',
    href: '/settings',
    icon: '/assets/icons/group-25.svg',
  },
  {
    name: 'Help center',
    href: '/help',
    icon: '/assets/icons/icon-help.svg',
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [userRole, setUserRole] = useState<string | null>(null)
  const [userName, setUserName] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [isCollapsed, setIsCollapsed] = useState(false)

  useEffect(() => {
    checkAuth()
    // Load collapsed state from localStorage
    const savedState = localStorage.getItem('sidebarCollapsed')
    if (savedState !== null) {
      setIsCollapsed(JSON.parse(savedState))
    }
  }, [])

  useEffect(() => {
    // Save collapsed state to localStorage
    localStorage.setItem('sidebarCollapsed', JSON.stringify(isCollapsed))
  }, [isCollapsed])

  async function checkAuth() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
      return
    }

    // Fetch user data
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('name, role_id')
      .eq('id', user.id)
      .single()

    if (userData) {
      setUserName(userData.name)
      
      // Fetch role name using role_id
      if (userData.role_id) {
        const { data: roleData, error: roleError } = await supabase
          .from('roles')
          .select('name')
          .eq('id', userData.role_id)
          .single()
        
        if (roleData) {
          setUserRole(roleData.name)
        } else if (roleError) {
          console.error('Error fetching role:', roleError)
        }
      }
    } else if (userError) {
      console.error('Error fetching user:', userError)
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

  // Filter menu items based on user role
  const filteredMenuItems = menuItems.filter((item) => {
    if (!item.roles) return true
    return userRole && item.roles.includes(userRole)
  })

  if (loading) {
    return (
      <div className={`${isCollapsed ? 'w-[60px]' : 'w-[240px]'} bg-black min-h-screen flex items-center justify-center transition-all duration-300`}>
        <div className="text-white">Loading...</div>
      </div>
    )
  }

  const renderMenuItem = (item: MenuItem) => {
    const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
    const isLeads = item.href === '/leads'
    
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`relative h-[48px] flex items-center transition-colors ${
          isActive
            ? 'bg-transparent'
            : 'bg-transparent hover:bg-gray-800'
        }`}
      >
        {/* Icon - 24px, positioned at 24px from left */}
        <div className="absolute left-[24px] top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center">
          {item.icon.startsWith('/') ? (
            <Image
              src={item.icon}
              alt={item.name}
              width={24}
              height={24}
              className="w-6 h-6"
              style={{
                filter: isActive && isLeads
                  ? 'none' // Red color for active Leads
                  : isActive
                    ? 'brightness(0) invert(1)' // White for other active items
                    : 'brightness(0) saturate(100%) invert(67%) sepia(8%) saturate(500%) hue-rotate(180deg) brightness(95%) contrast(88%)' // Gray for inactive
              }}
            />
          ) : (
            <span className="text-xl">{item.icon}</span>
          )}
        </div>
        
        {/* Text - 16px, positioned at 71px from left (24px icon + 23px gap) */}
        {!isCollapsed && (
          <p 
            className={`absolute left-[71px] top-1/2 -translate-y-1/2 font-medium text-base leading-none ${
              isActive && isLeads
                ? 'text-white'
                : isActive
                  ? 'text-white'
                  : 'text-gray-400'
            }`}
            style={{ fontFamily: 'Poppins, sans-serif' }}
          >
            {item.name}
          </p>
        )}
        
        {/* Red vertical bar for active Leads */}
        {isActive && isLeads && (
          <div className="absolute right-0 top-0 bottom-0 w-1 bg-[#de0510]" />
        )}
      </Link>
    )
  }

  return (
    <div className={`${isCollapsed ? 'w-[60px]' : 'w-[240px]'} bg-black min-h-screen flex flex-col transition-all duration-300`}>
      {/* Logo/Brand */}
      <div className="px-6 py-6 border-b border-gray-800 flex items-center justify-between">
        {!isCollapsed && (
          <h1 className="text-xl font-bold text-white">XCEГ</h1>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="text-white hover:text-gray-300 transition-colors ml-auto"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? '→' : '←'}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-0 py-4">
          {filteredMenuItems.map(renderMenuItem)}
        </div>
      </nav>

      {/* Bottom Section - Settings & Help */}
      <div className="border-t border-gray-800">
        <div className="flex flex-col gap-0 py-2">
          {bottomMenuItems.map(renderMenuItem)}
        </div>
      </div>

      {/* User Info */}
      <div className="border-t border-gray-800 px-6 py-7">
        {!isCollapsed && (
          <div className="flex items-center gap-[15px]">
            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-white font-semibold flex-shrink-0">
              {userName ? userName.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-medium text-white truncate" style={{ fontFamily: 'Poppins, sans-serif' }}>
                {userName || 'User'}
              </p>
              <p className="text-xs text-gray-400 leading-[1.5]" style={{ fontFamily: 'Poppins, sans-serif' }}>
                {userRole?.replace('_', ' ') || 'User'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
