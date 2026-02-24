'use client'

import { useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Image from 'next/image'
import { useAuthContext } from './AuthProvider'

interface NavItem {
  href: string
  label: string
  iconPath: string
  filledIconPath: string
  resource: string
  requiresPermissions?: boolean
  roles?: string[]
}

const ALL_NAV_ITEMS: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    iconPath: '/mobileviewicons/bottomnav/dashboard.svg',
    filledIconPath: '/mobileviewicons/filledicons/dashboardfilled.svg',
    resource: 'dashboard',
    requiresPermissions: false,
  },
  {
    href: '/followups',
    label: 'Tasks',
    iconPath: '/mobileviewicons/bottomnav/followuptask.svg',
    filledIconPath: '/mobileviewicons/filledicons/tasksfilled.svg',
    resource: 'followups',
    requiresPermissions: true,
  },
  {
    href: '/leads',
    label: 'Leads',
    iconPath: '/mobileviewicons/bottomnav/leads.svg',
    filledIconPath: '/mobileviewicons/filledicons/Leadsfilled.svg',
    resource: 'leads',
    requiresPermissions: true,
  },
  {
    href: '/customers',
    label: 'Customers',
    iconPath: '/mobileviewicons/bottomnav/customers.svg',
    filledIconPath: '/mobileviewicons/filledicons/customerfilled.svg',
    resource: 'customers',
    requiresPermissions: true,
  },
  {
    href: '/products',
    label: 'Products',
    iconPath: '/mobileviewicons/bottomnav/products.svg',
    filledIconPath: '/mobileviewicons/filledicons/productsfilled.svg',
    resource: 'products',
    requiresPermissions: true,
    roles: ['super_admin', 'admin', 'marketing'],
  },
]

export default function MobileBottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { role } = useAuthContext()
  const userRole = role?.name ?? null
  const userPermissions = role?.permissions ?? []

  const filteredNavItems = useMemo(() => {
    const roleLower = userRole?.toLowerCase() ?? ''
    const isSuperAdminOrAdmin = roleLower === 'super_admin' || roleLower === 'admin'

    return ALL_NAV_ITEMS.filter((item) => {
      if (isSuperAdminOrAdmin) return true
      if (!item.requiresPermissions) return true
      if (item.roles && userRole && item.roles.some((r) => r.toLowerCase() === roleLower)) return true
      const hasRead = userPermissions.includes(`${item.resource}.read`)
      const hasManage = userPermissions.includes(`${item.resource}.manage`)
      return hasRead || hasManage
    })
  }, [userRole, userPermissions])

  const handleNavigation = (href: string) => {
    router.push(href)
  }

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-[2px] h-[98px] z-30">
      <div className="flex items-center justify-around h-full px-2">
        {filteredNavItems.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
          
          return (
            <button
              key={item.href}
              onClick={() => handleNavigation(item.href)}
              className="flex flex-col items-center justify-center relative flex-1 h-full"
            >
              {/* Red line indicator for selected item - positioned at top */}
              {isActive && (
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-[30px] h-[3px] bg-[#ed1b24] rounded-full" />
              )}
              
              {/* Icon container with rounded border for selected item */}
              <div className="flex flex-col items-center justify-center gap-1 mt-3">
                <div
                  className={`flex items-center justify-center transition-all duration-200 ${
                    isActive
                      ? 'w-[46px] h-[46px] rounded-lg border p-2'
                      : 'w-auto h-auto p-0'
                  }`}
                  style={isActive ? { 
                    backgroundColor: '#FBE5E7',
                    borderColor: 'rgba(237, 27, 36, 0.3)',
                    borderWidth: '1px'
                  } : {}}
                >
                  <div
                    className={`relative flex items-center justify-center transition-all duration-200 ${
                      isActive ? 'w-[26px] h-[26px]' : 'w-[18px] h-[18px]'
                    }`}
                  >
                    <Image
                      src={isActive ? item.filledIconPath : item.iconPath}
                      alt={item.label}
                      width={isActive ? 26 : 18}
                      height={isActive ? 26 : 18}
                      className="object-contain"
                      style={{
                        width: '100%',
                        height: '100%',
                        filter: isActive ? 'none' : 'brightness(0) saturate(100%)',
                      }}
                    />
                  </div>
                </div>
                
                {/* Label */}
                <span className="text-[10px] text-black font-['Poppins',sans-serif] leading-[1.5]">
                  {item.label}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
