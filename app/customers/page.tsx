'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useCustomers } from '@/hooks/useCustomers'
import Layout from '@/components/Layout'
import { Search, Bell, MoreVertical, ChevronDown, Phone, Mail, Building2, TrendingUp, List, Columns, Grid, Calendar, User } from 'lucide-react'
import Image from 'next/image'

interface Customer {
  id: string
  name: string
  phone: string
  email: string | null
  customer_type: string
  created_at: string
}

interface CustomerStats {
  totalCustomers: number
  newCustomers: number
  repeatCustomers: number
  highValueCustomers: number
}

// User Avatar Component with fallback
function UserAvatar({ name }: { name: string }) {
  return (
    <div className="w-10 h-10 rounded-full bg-[#ed1b24] flex items-center justify-center text-white text-sm font-medium">
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

// Grid View Component
function GridView({
  customers,
  getTimeAgo,
  router
}: {
  customers: Customer[]
  getTimeAgo: (date: string | null) => string
  router: ReturnType<typeof useRouter>
}) {
  // Get customer type badge color
  function getCustomerTypeBadgeClass(customerType: string): string {
    if (customerType === 'high_value') {
      return 'bg-[#E8F5E9] text-[#4CAF50]'
    } else if (customerType === 'repeat') {
      return 'bg-[#E3F2FD] text-[#2196F3]'
    }
    return 'bg-[#E0E0E0] text-[#616161]'
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
      {customers.map((customer) => {
        return (
          <div
            key={customer.id}
            onClick={() => router.push(`/customers/${customer.id}`)}
            className="bg-white rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer border border-[#eaecee] overflow-hidden"
          >
            {/* CARD HEADER */}
            <div className="px-4 py-3 bg-gradient-to-r from-[#fafafa] to-white border-b border-[#eaecee]">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0 pr-2">
                  <h3 
                    className="text-sm font-bold text-[#242d35] truncate hover:text-[#de0510] transition-colors cursor-pointer"
                    style={{ fontSize: '14px' }}
                  >
                    {customer.name}
                  </h3>
                </div>
                {/* Type Icon */}
                <div className={`p-1.5 rounded-full flex items-center justify-center flex-shrink-0 ${
                  customer.customer_type === 'high_value' ? 'bg-[#4CAF50]' : 
                  customer.customer_type === 'repeat' ? 'bg-[#2196F3]' : 
                  'bg-[#616161]'
                }`}>
                  <User className="w-3.5 h-3.5 text-white" />
                </div>
              </div>
              
              {/* Type Badge */}
              <div className="flex items-center gap-1.5 mt-2">
                <span className={`px-2 py-0.5 rounded-full text-[10px] ${getCustomerTypeBadgeClass(customer.customer_type)}`}>
                  {customer.customer_type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </span>
              </div>
            </div>

            {/* CARD BODY - 2 Column Grid */}
            <div className="px-4 py-3 grid grid-cols-2 gap-x-3 gap-y-2">
              {/* Phone (top-left) */}
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-[#FFF4E6] flex items-center justify-center flex-shrink-0">
                  <Phone className="w-3 h-3 text-[#FF9500]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] text-[#717d8a] uppercase tracking-wide">PHONE</p>
                  <p className="text-[11px] font-medium text-[#242d35] truncate break-all">{customer.phone || '-'}</p>
                </div>
              </div>

              {/* Email (top-right) */}
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-[#E3F2FD] flex items-center justify-center flex-shrink-0">
                  <Mail className="w-3 h-3 text-[#2196F3]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] text-[#717d8a] uppercase tracking-wide">EMAIL</p>
                  <p className="text-[11px] font-medium text-[#242d35] truncate break-all">{customer.email || '-'}</p>
                </div>
              </div>

              {/* Created (spans 2 columns) */}
              <div className="flex items-center gap-2 col-span-2">
                <div className="w-6 h-6 rounded-full bg-[#E0E0E0] flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-3 h-3 text-[#616161]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] text-[#717d8a] uppercase tracking-wide">CREATED</p>
                  <p className="text-[11px] font-medium text-[#242d35] truncate">{getTimeAgo(customer.created_at)}</p>
                </div>
              </div>
            </div>

            {/* CARD FOOTER */}
            <div className="px-4 py-3 bg-[#fafafa] border-t border-[#eaecee]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <UserAvatar name={customer.name} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium text-[#242d35] truncate">{customer.name}</p>
                    <p className="text-[9px] text-[#717d8a]">Customer</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Kanban Board Component
function KanbanBoard({ 
  customers, 
  groupBy, 
  getTimeAgo,
  router
}: {
  customers: Customer[]
  groupBy: string
  getTimeAgo: (date: string | null) => string
  router: ReturnType<typeof useRouter>
}) {
  // Group customers by the selected field
  function groupCustomers() {
    const groups: Record<string, Customer[]> = {}
    
    customers.forEach(customer => {
      let groupKey = ''
      
      if (groupBy === 'customer_type') {
        groupKey = customer.customer_type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
      } else if (groupBy === 'created_at') {
        // Group by date (today, this week, this month, older)
        const createdDate = new Date(customer.created_at)
        const now = new Date()
        const diffDays = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24))
        
        if (diffDays === 0) {
          groupKey = 'Today'
        } else if (diffDays <= 7) {
          groupKey = 'This Week'
        } else if (diffDays <= 30) {
          groupKey = 'This Month'
        } else {
          groupKey = 'Older'
        }
      } else {
        groupKey = 'All Customers'
      }
      
      if (!groups[groupKey]) {
        groups[groupKey] = []
      }
      groups[groupKey].push(customer)
    })
    
    return groups
  }

  const groupedCustomers = groupCustomers()
  const groupKeys = Object.keys(groupedCustomers).sort()

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-4 min-w-max">
        {groupKeys.map((groupKey) => {
          const groupCustomersList = groupedCustomers[groupKey]
          
          return (
            <div
              key={groupKey}
              className="flex-shrink-0 w-80 bg-gray-50 rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-gray-900">{groupKey}</h3>
                <span className="text-sm text-gray-500 bg-white px-2 py-1 rounded-full">
                  {groupCustomersList.length}
                </span>
              </div>
              
              <div className="space-y-3">
                {groupCustomersList.map((customer) => {
                  return (
                    <div
                      key={customer.id}
                      onClick={() => router.push(`/customers/${customer.id}`)}
                      className="bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer border border-gray-200"
                    >
                      <div className="mb-3 relative">
                        <div className="flex-1 min-w-0 pr-12">
                          <h4 className="text-base font-bold text-gray-900 truncate">{customer.name}</h4>
                        </div>
                        <div className="absolute top-0 right-0">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            customer.customer_type === 'high_value' 
                              ? 'bg-green-100 text-green-800'
                              : customer.customer_type === 'repeat'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {customer.customer_type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </span>
                        </div>
                      </div>
                      
                      {/* Contact Information */}
                      <div className="space-y-1 mb-2">
                        {customer.phone && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-600">
                            <Phone size={12} className="text-gray-500" />
                            <span className="break-all">{customer.phone}</span>
                          </div>
                        )}
                        {customer.email && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-600">
                            <Mail size={12} className="text-gray-500" />
                            <span className="break-all">{customer.email}</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <UserAvatar name={customer.name} />
                          <span className="text-xs font-medium text-gray-900">{customer.name}</span>
                        </div>
                        <span className="text-xs text-gray-500">
                          {getTimeAgo(customer.created_at)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function CustomersPage() {
  const router = useRouter()
  const { user, isLoading: authLoading, isAuthenticated } = useAuth()
  const { data: allCustomers = [], isLoading: customersLoading } = useCustomers()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [stats, setStats] = useState<CustomerStats>({
    totalCustomers: 0,
    newCustomers: 0,
    repeatCustomers: 0,
    highValueCustomers: 0,
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'table' | 'kanban' | 'grid'>('table')
  const [groupBy, setGroupBy] = useState<string>('customer_type')
  const [groupByDropdownOpen, setGroupByDropdownOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [containerStyles, setContainerStyles] = useState({
    containerColor: '#000000',
    iconColor: '#ffffff',
    textColor: '#ffffff',
    opacity: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  })

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated, router])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.groupby-dropdown')) {
        setGroupByDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Load container styles from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('customers-container-styles')
      if (saved) {
        try {
          setContainerStyles(JSON.parse(saved))
        } catch (e) {
          // Use defaults
        }
      }
    }
  }, [])

  // Calculate stats from customers
  useEffect(() => {
    if (allCustomers.length > 0) {
      const newCustomers = allCustomers.filter(c => c.customer_type === 'new').length
      const repeatCustomers = allCustomers.filter(c => c.customer_type === 'repeat').length
      const highValueCustomers = allCustomers.filter(c => c.customer_type === 'high_value').length
      
      setStats({
        totalCustomers: allCustomers.length,
        newCustomers,
        repeatCustomers,
        highValueCustomers,
      })
    }
  }, [allCustomers])

  // Filter, sort and paginate customers
  useEffect(() => {
    let filtered = [...allCustomers]
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(customer => 
        customer.name.toLowerCase().includes(query) ||
        customer.phone.includes(query) ||
        customer.email?.toLowerCase().includes(query) ||
        customer.customer_type.toLowerCase().includes(query)
      )
    }
    
    // Sort by created_at descending
    filtered.sort((a, b) => {
      const aDate = new Date(a.created_at).getTime()
      const bDate = new Date(b.created_at).getTime()
      return bDate - aDate
    })
    
    // Pagination (only for table view)
    if (viewMode === 'table') {
      const startIndex = (currentPage - 1) * itemsPerPage
      const endIndex = startIndex + itemsPerPage
      setCustomers(filtered.slice(startIndex, endIndex))
    } else {
      // For Kanban and Grid views, show all filtered customers
      setCustomers(filtered)
    }
  }, [allCustomers, searchQuery, currentPage, itemsPerPage, viewMode])

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, viewMode])


  // Format time ago
  function getTimeAgo(dateString: string | null): string {
    if (!dateString) return 'Never'
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)
    
    if (diffHours < 1) return 'Just now'
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    if (diffDays === 1) return '1 day ago'
    return `${diffDays} days ago`
  }

  const totalPages = Math.ceil(
    allCustomers.filter(customer => {
      if (!searchQuery.trim()) return true
      const query = searchQuery.toLowerCase()
      return customer.name.toLowerCase().includes(query) ||
             customer.phone.includes(query) ||
             customer.email?.toLowerCase().includes(query) ||
             customer.customer_type.toLowerCase().includes(query)
    }).length / itemsPerPage
  )

  // Show page structure immediately, only block if not authenticated
  if (!authLoading && !isAuthenticated) {
    return null // Will redirect in useEffect
  }

  return (
    <Layout>
      <div className="p-6 bg-gray-50 min-h-screen">
        <div className="w-full">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold text-gray-900">Customers</h1>
              <span className="text-gray-400 text-lg">/</span>
              <div className="flex items-center gap-1 text-gray-600 text-lg">
                <span>
                  {viewMode === 'table' ? 'Table View' : 
                   viewMode === 'kanban' ? 'Kanban View' : 
                   'Grid View'}
                </span>
                <ChevronDown size={18} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-md">
                <Bell size={20} />
              </button>
              <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-md">
                <Search size={20} />
              </button>
              <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-md">
                <MoreVertical size={20} />
              </button>
            </div>
          </div>

          {/* Summary Cards - Show skeleton while loading */}
          {customersLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-white rounded-lg shadow-sm p-6 animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded w-16"></div>
                </div>
              ))}
            </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {/* Total Customers Card */}
            <div className="bg-white rounded-lg shadow-sm p-6 flex items-center justify-between">
              <div>
                <p className="text-base text-gray-500 mb-1">Total Customers</p>
                <p className="text-4xl font-bold text-gray-900">{stats.totalCustomers}</p>
              </div>
              <div className="relative w-16 h-16">
                <svg className="w-16 h-16 transform -rotate-90">
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke="#f3f4f6"
                    strokeWidth="6"
                  />
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="6"
                    strokeDasharray={`${(stats.totalCustomers > 0 ? 100 : 0) * 175.9 / 100} 175.9`}
                    strokeLinecap="round"
                  />
                </svg>
                <TrendingUp className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-[#3b82f6]" size={20} />
              </div>
            </div>

            {/* New Customers Card */}
            <div className="bg-white rounded-lg shadow-sm p-6 flex items-center justify-between">
              <div>
                <p className="text-base text-gray-500 mb-1">New Customers</p>
                <p className="text-4xl font-bold text-gray-900">{stats.newCustomers}</p>
              </div>
              <div className="relative w-16 h-16">
                <svg className="w-16 h-16 transform -rotate-90">
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke="#f3f4f6"
                    strokeWidth="6"
                  />
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="6"
                    strokeDasharray={`${(stats.totalCustomers > 0 ? (stats.newCustomers / stats.totalCustomers) * 100 : 0) * 175.9 / 100} 175.9`}
                    strokeLinecap="round"
                  />
                </svg>
                <TrendingUp className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-[#10b981]" size={20} />
              </div>
            </div>

            {/* Repeat Customers Card */}
            <div className="bg-white rounded-lg shadow-sm p-6 flex items-center justify-between">
              <div>
                <p className="text-base text-gray-500 mb-1">Repeat Customers</p>
                <p className="text-4xl font-bold text-gray-900">{stats.repeatCustomers}</p>
              </div>
              <div className="relative w-16 h-16">
                <svg className="w-16 h-16 transform -rotate-90">
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke="#f3f4f6"
                    strokeWidth="6"
                  />
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke="#ed1b24"
                    strokeWidth="6"
                    strokeDasharray={`${(stats.totalCustomers > 0 ? (stats.repeatCustomers / stats.totalCustomers) * 100 : 0) * 175.9 / 100} 175.9`}
                    strokeLinecap="round"
                  />
                </svg>
                <TrendingUp className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-[#ed1b24]" size={20} />
              </div>
            </div>

            {/* High Value Customers Card */}
            <div className="bg-white rounded-lg shadow-sm p-6 flex items-center justify-between">
              <div>
                <p className="text-base text-gray-500 mb-1">High Value</p>
                <p className="text-4xl font-bold text-gray-900">{stats.highValueCustomers}</p>
              </div>
              <div className="relative w-16 h-16">
                <svg className="w-16 h-16 transform -rotate-90">
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke="#f3f4f6"
                    strokeWidth="6"
                  />
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="6"
                    strokeDasharray={`${(stats.totalCustomers > 0 ? (stats.highValueCustomers / stats.totalCustomers) * 100 : 0) * 175.9 / 100} 175.9`}
                    strokeLinecap="round"
                  />
                </svg>
                <TrendingUp className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-[#10b981]" size={20} />
              </div>
            </div>
          </div>
          )}

          {/* Filter and Search Bar */}
          <div 
            className="rounded-lg shadow-sm p-4 mb-4 flex items-center justify-between gap-4"
            style={{
              backgroundColor: containerStyles.containerColor,
              opacity: containerStyles.opacity,
            }}
          >
            <div className="flex items-center gap-3 flex-1">
              <div className="flex-1 max-w-md relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2" size={18} style={{ color: containerStyles.iconColor + 'CC' }} />
                <input
                  type="text"
                  placeholder="Try 'customer name'"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="w-full pl-10 pr-4 py-2.5 text-base border rounded-md focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-all"
                  style={{ 
                    color: containerStyles.textColor,
                    backgroundColor: containerStyles.backgroundColor,
                    borderColor: containerStyles.textColor + '30',
                    '--tw-ring-color': containerStyles.textColor + '50',
                  } as React.CSSProperties & { '--tw-ring-color'?: string }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode('table')}
                className={`p-2 rounded-md transition-colors ${viewMode === 'table' ? 'text-[#ed1b24]' : 'hover:opacity-80'}`}
                style={{ 
                  color: viewMode === 'table' ? '#ed1b24' : containerStyles.iconColor,
                  backgroundColor: viewMode === 'table' ? '#ffffff' : 'transparent',
                }}
                title="Table View"
              >
                <List size={18} />
              </button>
              <button
                onClick={() => setViewMode('kanban')}
                className={`p-2 rounded-md transition-colors ${viewMode === 'kanban' ? 'text-[#ed1b24]' : 'hover:opacity-80'}`}
                style={{ 
                  color: viewMode === 'kanban' ? '#ed1b24' : containerStyles.iconColor,
                  backgroundColor: viewMode === 'kanban' ? '#ffffff' : 'transparent',
                }}
                title="Kanban View"
              >
                <Columns size={18} />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-md transition-colors ${viewMode === 'grid' ? 'text-[#ed1b24]' : 'hover:opacity-80'}`}
                style={{ 
                  color: viewMode === 'grid' ? '#ed1b24' : containerStyles.iconColor,
                  backgroundColor: viewMode === 'grid' ? '#ffffff' : 'transparent',
                }}
                title="Grid View"
              >
                <Grid size={18} />
              </button>
              <button 
                className="px-4 py-2 text-base border rounded-md hover:opacity-80 flex items-center gap-2 transition-all"
                style={{ 
                  color: containerStyles.textColor,
                  backgroundColor: containerStyles.backgroundColor,
                  borderColor: containerStyles.textColor + '30',
                }}
              >
                <MoreVertical size={18} style={{ color: containerStyles.iconColor }} />
              </button>
            </div>
          </div>

          {/* Group By Dropdown for Kanban View */}
          {viewMode === 'kanban' && (
            <div className="mb-4 flex items-center gap-3">
              <div className="relative groupby-dropdown">
                <button
                  onClick={() => {
                    setGroupByDropdownOpen(!groupByDropdownOpen)
                  }}
                  className="px-4 py-2 text-base text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50 flex items-center gap-2"
                >
                  <span>Group by: {
                    groupBy === 'customer_type' ? 'Customer Type' : 
                    'Created Date'
                  }</span>
                  <ChevronDown size={18} className={`transition-transform ${groupByDropdownOpen ? 'transform rotate-180' : ''}`} />
                </button>
                {groupByDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[200px]">
                    <div className="p-2">
                      {[
                        { key: 'customer_type', label: 'Customer Type' },
                        { key: 'created_at', label: 'Created Date' },
                      ].map((option) => (
                        <button
                          key={option.key}
                          onClick={() => {
                            setGroupBy(option.key)
                            setGroupByDropdownOpen(false)
                          }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded ${
                            groupBy === option.key ? 'bg-blue-50 text-blue-700 font-medium' : ''
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Customers Table View */}
          {viewMode === 'table' && (
            <>
              <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-4 text-left text-sm font-medium text-gray-500 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-gray-500 uppercase tracking-wider">
                          Contact
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-gray-500 uppercase tracking-wider">
                          Type
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-gray-500 uppercase tracking-wider">
                          Created
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {customers.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-base text-gray-500">
                            No customers found
                          </td>
                        </tr>
                      ) : (
                        customers.map((customer) => (
                          <tr 
                            key={customer.id}
                            className="hover:bg-gray-50 cursor-pointer"
                            onClick={() => router.push(`/customers/${customer.id}`)}
                          >
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-base font-medium text-gray-900">
                                {customer.name}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="space-y-1">
                                {customer.phone && (
                                  <div className="flex items-center gap-1.5 text-base text-gray-500">
                                    <Phone size={16} />
                                    <span className="break-all">{customer.phone}</span>
                                  </div>
                                )}
                                {customer.email && (
                                  <div className="flex items-center gap-1.5 text-base text-gray-500">
                                    <Mail size={16} />
                                    <span className="break-all">{customer.email}</span>
                                  </div>
                                )}
                                {!customer.phone && !customer.email && (
                                  <span className="text-base text-gray-500">-</span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-3 py-1.5 text-sm font-semibold rounded-full ${
                                customer.customer_type === 'high_value' 
                                  ? 'bg-green-100 text-green-800'
                                  : customer.customer_type === 'repeat'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}>
                                {customer.customer_type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="text-base text-gray-500">
                                {getTimeAgo(customer.created_at)}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  router.push(`/customers/${customer.id}`)
                                }}
                                className="text-[#ed1b24] hover:text-[#d11820] font-medium"
                              >
                                View Details
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="bg-white rounded-lg shadow-sm mt-4 p-4 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="px-4 py-2 text-base font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                        if (
                          page === 1 ||
                          page === totalPages ||
                          (page >= currentPage - 1 && page <= currentPage + 1)
                        ) {
                          return (
                            <button
                              key={page}
                              onClick={() => setCurrentPage(page)}
                              className={`px-3 py-2 text-base font-medium rounded-md ${
                                currentPage === page
                                  ? 'bg-[#ed1b24] text-white'
                                  : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              {page}
                            </button>
                          )
                        } else if (page === currentPage - 2 || page === currentPage + 2) {
                          return <span key={page} className="px-2 text-gray-500 text-base">...</span>
                        }
                        return null
                      })}
                    </div>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="px-4 py-2 text-base font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-base text-gray-600">
                      Page {currentPage} of {totalPages}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-base text-gray-600">Show:</span>
                      <select
                        value={itemsPerPage}
                        onChange={(e) => {
                          setItemsPerPage(Number(e.target.value))
                          setCurrentPage(1)
                        }}
                        className="px-3 py-1.5 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#ed1b24]"
                      >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Kanban View */}
          {viewMode === 'kanban' && (
            <KanbanBoard 
              customers={customers}
              groupBy={groupBy}
              getTimeAgo={getTimeAgo}
              router={router}
            />
          )}

          {/* Grid View */}
          {viewMode === 'grid' && (
            <>
              <GridView 
                customers={customers}
                getTimeAgo={getTimeAgo}
                router={router}
              />
              {/* Pagination for Grid View */}
              {totalPages > 1 && (
                <div className="bg-white rounded-lg shadow-sm mt-4 p-4 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="px-4 py-2 text-base font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                        if (
                          page === 1 ||
                          page === totalPages ||
                          (page >= currentPage - 1 && page <= currentPage + 1)
                        ) {
                          return (
                            <button
                              key={page}
                              onClick={() => setCurrentPage(page)}
                              className={`px-3 py-2 text-base font-medium rounded-md ${
                                currentPage === page
                                  ? 'bg-[#ed1b24] text-white'
                                  : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              {page}
                            </button>
                          )
                        } else if (page === currentPage - 2 || page === currentPage + 2) {
                          return <span key={page} className="px-2 text-gray-500 text-base">...</span>
                        }
                        return null
                      })}
                    </div>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="px-4 py-2 text-base font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                  <div className="text-base text-gray-600">
                    Page {currentPage} of {totalPages}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  )
}
