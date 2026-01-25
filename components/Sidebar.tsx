'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface MenuItem {
  name: string
  href: string
  icon: string
  roles?: string[] // If specified, only show for these roles
}

const menuItems: MenuItem[] = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: '📊',
  },
  {
    name: 'Leads',
    href: '/leads',
    icon: '👥',
  },
  {
    name: 'Customers',
    href: '/customers',
    icon: '🏢',
  },
  {
    name: 'Orders',
    href: '/orders',
    icon: '📦',
  },
  {
    name: 'Quotations',
    href: '/quotations',
    icon: '📄',
  },
  {
    name: 'Roles & Permissions',
    href: '/admin/roles',
    icon: '🔐',
    roles: ['super_admin', 'admin'],
  },
  {
    name: 'User Management',
    href: '/admin/users',
    icon: '👤',
    roles: ['super_admin', 'admin'],
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [userRole, setUserRole] = useState<string | null>(null)
  const [userName, setUserName] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAuth()
  }, [])

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

  // Filter menu items based on user role
  const filteredMenuItems = menuItems.filter((item) => {
    if (!item.roles) return true
    return userRole && item.roles.includes(userRole)
  })

  if (loading) {
    return (
      <div className="w-64 bg-gray-900 min-h-screen flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    )
  }

  return (
    <div className="w-64 bg-gray-900 min-h-screen flex flex-col">
      {/* Logo/Brand */}
      <div className="p-6 border-b border-gray-800">
        <h1 className="text-xl font-bold text-white">Xcel CRM</h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {filteredMenuItems.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="font-medium">{item.name}</span>
            </Link>
          )
        })}
      </nav>

      {/* User Info & Logout */}
      <div className="p-4 border-t border-gray-800">
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
