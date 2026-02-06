'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuthContext } from '@/components/AuthProvider'
import Layout from '@/components/Layout'
import {
  Users,
  Building2,
  User,
  IndianRupee,
  Filter,
  Upload,
  Plus,
  Mail,
  Phone,
} from 'lucide-react'

type CustomerType = 'dealership' | 'individual'

interface Customer {
  id: string
  name: string
  phone: string
  email: string | null
  customer_type: string
  tags: string[] | null
  created_at: string
  total_revenue?: number
}

type FilterType = 'all' | 'dealership' | 'individual'

interface CreateCustomerForm {
  type: CustomerType
  name: string
  email: string
  phone: string
  city: string
  state: string
  pincode: string
  notes: string
}

export default function CustomersPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthContext()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>('all')
  const [activeStatsFilter, setActiveStatsFilter] = useState<'all' | 'total' | 'dealership' | 'individual' | 'revenue' | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [createForm, setCreateForm] = useState<CreateCustomerForm>({
    type: 'individual',
    name: '',
    email: '',
    phone: '',
    city: '',
    state: '',
    pincode: '',
    notes: '',
  })
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    // Keep existing auth check behaviour in case of edge cases.
    checkAuth()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) return
    fetchCustomers()
  }, [isAuthenticated])

  async function checkAuth() {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
    }
  }

  async function fetchCustomers() {
    try {
      const response = await fetch('/api/customers')
      if (response.ok) {
        const data = await response.json()
        setCustomers(data.customers || [])
      }
    } catch (error) {
      console.error('Failed to fetch customers:', error)
    } finally {
      setLoading(false)
    }
  }

  function getUiType(customer: Customer): CustomerType {
    const tags = customer.tags || []
    if (tags.some((t) => t.toLowerCase().includes('dealership'))) return 'dealership'
    if (tags.some((t) => t.toLowerCase().includes('individual'))) return 'individual'
    return 'individual'
  }

  function getUiStatus(customer: Customer): { label: string; variant: 'active' | 'repeat' | 'high' } {
    const type = customer.customer_type
    if (type === 'high_value') return { label: 'High Value', variant: 'high' }
    if (type === 'repeat') return { label: 'Repeat', variant: 'repeat' }
    return { label: 'New', variant: 'active' }
  }

  const filteredCustomers = useMemo(() => {
    let filtered = customers
    
    // Apply stats card filter
    if (activeStatsFilter === 'dealership') {
      filtered = filtered.filter((c) => getUiType(c) === 'dealership')
    } else if (activeStatsFilter === 'individual') {
      filtered = filtered.filter((c) => getUiType(c) === 'individual')
    }
    
    // Apply main filter
    if (filter === 'all') return filtered
    return filtered.filter((c) => getUiType(c) === filter)
  }, [customers, filter, activeStatsFilter])

  const stats = useMemo(() => {
    const total = customers.length
    let dealerships = 0
    let individuals = 0

    customers.forEach((c) => {
      const t = getUiType(c)
      if (t === 'dealership') dealerships += 1
      else individuals += 1
    })

    const totalRevenue = customers.reduce(
      (sum, c) => sum + (c.total_revenue || 0),
      0
    )

    return {
      totalCustomers: total,
      dealerships,
      individuals,
      totalRevenue,
    }
  }, [customers])

  async function handleCreateCustomer(e: React.FormEvent) {
    e.preventDefault()
    if (!createForm.name.trim() || !createForm.phone.trim()) {
      alert('Name and phone are required')
      return
    }

    setCreating(true)
    try {
      const tags: string[] = []
      tags.push(`type:${createForm.type}`)
      if (createForm.city) tags.push(`city:${createForm.city}`)
      if (createForm.state) tags.push(`state:${createForm.state}`)
      if (createForm.pincode) tags.push(`pincode:${createForm.pincode}`)
      if (createForm.notes) tags.push(`notes:${createForm.notes}`)

      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createForm.name.trim(),
          phone: createForm.phone.trim(),
          email: createForm.email.trim() || null,
          customer_type: 'new',
          tags,
        }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => null)
        alert(err?.error || 'Failed to create customer')
        return
      }

      setShowCreateModal(false)
      setCreateForm({
        type: 'individual',
        name: '',
        email: '',
        phone: '',
        city: '',
        state: '',
        pincode: '',
        notes: '',
      })
      await fetchCustomers()
    } catch (error) {
      console.error('Failed to create customer:', error)
      alert('Failed to create customer')
    } finally {
      setCreating(false)
    }
  }

  async function handleRowClick(customerId: string) {
    router.push(`/customers/${customerId}`)
  }

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-lg">Loading customers...</div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="p-4 md:p-6 lg:p-8 bg-[#f5f5f5] min-h-screen w-full">
        <div className="space-y-4 md:space-y-6 w-full">
          {/* Header */}
          <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-[28px] md:text-[32px] font-bold text-[#242d35]">
                Customer Management
              </h1>
              <p className="text-sm text-[#717d8a]">
                Manage dealerships and individual customers
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className="inline-flex items-center gap-2 rounded-[32px] border border-[#eaecee] bg-white px-4 py-2 text-sm font-medium text-[#242d35] hover:bg-[#fafafa] shadow-sm"
              >
                <Upload size={16} />
                Import
              </button>
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 rounded-[32px] bg-[#de0510] px-5 py-2.5 text-sm font-medium text-white shadow-[0_4px_12px_rgba(222,5,16,0.2)] hover:bg-[#c00410]"
              >
                <Plus size={16} />
                New Customer
              </button>
            </div>
          </header>

          {/* Stats cards - 2 per row on mobile, filterable */}
          <section className="grid grid-cols-2 gap-3 md:gap-4">
            <button
              type="button"
              onClick={() => setActiveStatsFilter(prev => prev === 'total' ? null : 'total')}
              className={`rounded-[12px] bg-white border p-4 md:p-5 flex items-start justify-between shadow-sm transition-all text-left ${
                activeStatsFilter === 'total' ? 'border-[#2196F3] ring-2 ring-[#2196F3] bg-blue-50' : 'border-[#eaecee]'
              }`}
            >
              <div>
                <p className="text-xs font-medium text-[#717d8a] uppercase tracking-wide">
                  Total Customers
                </p>
                <p className="mt-2 text-2xl font-bold text-[#242d35]">
                  {stats.totalCustomers}
                </p>
              </div>
              <div className="w-10 h-10 rounded-full bg-[#E3F2FD] flex items-center justify-center flex-shrink-0">
                <Users size={20} className="text-[#2196F3]" />
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                const newFilter = activeStatsFilter === 'dealership' ? null : 'dealership'
                setActiveStatsFilter(newFilter)
                if (newFilter === 'dealership') {
                  setFilter('dealership')
                }
              }}
              className={`rounded-[12px] bg-white border p-4 md:p-5 flex items-start justify-between shadow-sm transition-all text-left ${
                activeStatsFilter === 'dealership' ? 'border-[#44C13C] ring-2 ring-[#44C13C] bg-green-50' : 'border-[#eaecee]'
              }`}
            >
              <div>
                <p className="text-xs font-medium text-[#717d8a] uppercase tracking-wide">
                  Dealerships
                </p>
                <p className="mt-2 text-2xl font-bold text-[#242d35]">
                  {stats.dealerships}
                </p>
              </div>
              <div className="w-10 h-10 rounded-full bg-[#E8F5E9] flex items-center justify-center flex-shrink-0">
                <Building2 size={20} className="text-[#44C13C]" />
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                const newFilter = activeStatsFilter === 'individual' ? null : 'individual'
                setActiveStatsFilter(newFilter)
                if (newFilter === 'individual') {
                  setFilter('individual')
                }
              }}
              className={`rounded-[12px] bg-white border p-4 md:p-5 flex items-start justify-between shadow-sm transition-all text-left ${
                activeStatsFilter === 'individual' ? 'border-[#9C27B0] ring-2 ring-[#9C27B0] bg-purple-50' : 'border-[#eaecee]'
              }`}
            >
              <div>
                <p className="text-xs font-medium text-[#717d8a] uppercase tracking-wide">
                  Individuals
                </p>
                <p className="mt-2 text-2xl font-bold text-[#242d35]">
                  {stats.individuals}
                </p>
              </div>
              <div className="w-10 h-10 rounded-full bg-[#F3E5F5] flex items-center justify-center flex-shrink-0">
                <User size={20} className="text-[#9C27B0]" />
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveStatsFilter(prev => prev === 'revenue' ? null : 'revenue')}
              className={`rounded-[12px] bg-white border p-4 md:p-5 flex items-start justify-between shadow-sm transition-all text-left ${
                activeStatsFilter === 'revenue' ? 'border-[#FF513A] ring-2 ring-[#FF513A] bg-orange-50' : 'border-[#eaecee]'
              }`}
            >
              <div>
                <p className="text-xs font-medium text-[#717d8a] uppercase tracking-wide">
                  Total Revenue
                </p>
                <p className="mt-2 text-xl font-bold text-[#242d35]">
                  ₹{stats.totalRevenue.toLocaleString('en-IN')}
                </p>
              </div>
              <div className="w-10 h-10 rounded-full bg-[#FFE8D7] flex items-center justify-center flex-shrink-0">
                <IndianRupee size={20} className="text-[#FF513A]" />
              </div>
            </button>
          </section>

          {/* Filters + view toggle */}
          <section className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="inline-flex items-center gap-2 rounded-[32px] bg-white border border-[#eaecee] px-2 py-1">
              {(['all', 'dealership', 'individual'] as FilterType[]).map((key) => {
                const isActive = filter === key
                const label =
                  key === 'all'
                    ? `All (${stats.totalCustomers})`
                    : key === 'dealership'
                    ? `Dealership (${stats.dealerships})`
                    : `Individual (${stats.individuals})`
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={`px-4 py-2 rounded-[32px] text-xs md:text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-[#de0510] text-white shadow-[0_2px_4px_rgba(222,5,16,0.2)]'
                        : 'bg-transparent text-[#717d8a] hover:bg-[#fafafa]'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            <div className="inline-flex items-center gap-2 rounded-[32px] bg-white border border-[#eaecee] px-3 py-1 text-xs md:text-sm text-[#717d8a]">
              <Filter size={14} />
              <span>View: Table</span>
            </div>
          </section>

          {/* Table */}
          <section className="rounded-[12px] bg-white border border-[#eaecee] shadow-sm overflow-hidden">
            <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
              <div className="min-w-full inline-block md:block">
                <table className="min-w-full w-full">
                <thead className="bg-[#fafafa]">
                  <tr>
                    <th className="px-6 py-3 text-left text-[11px] font-medium text-[#4f5b67]">
                      Customer
                    </th>
                    <th className="px-6 py-3 text-left text-[11px] font-medium text-[#4f5b67]">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-[11px] font-medium text-[#4f5b67]">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-[11px] font-medium text-[#4f5b67]">
                      Contact
                    </th>
                    <th className="px-6 py-3 text-left text-[11px] font-medium text-[#4f5b67]">
                      Total Purchase
                    </th>
                    <th className="px-6 py-3 text-left text-[11px] font-medium text-[#4f5b67]">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-[11px] font-medium text-[#4f5b67]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f1f1] bg-white">
                  {filteredCustomers.map((customer) => {
                    const uiType = getUiType(customer)
                    const { label: statusLabel, variant } = getUiStatus(customer)

                    return (
                      <tr
                        key={customer.id}
                        className="hover:bg-[#fafafa] cursor-pointer transition-colors"
                        onClick={() => handleRowClick(customer.id)}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-[#d8d8fe] flex items-center justify-center text-sm font-semibold text-[#242d35]">
                              {customer.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-[#242d35] truncate">
                                {customer.name}
                              </p>
                              {customer.email && (
                                <p className="text-xs text-[#717d8a] truncate">
                                  {customer.email}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex px-3 py-1 rounded-[16px] text-[11px] font-medium ${
                              uiType === 'dealership'
                                ? 'bg-[#E3F2FD] text-[#2196F3]'
                                : 'bg-[#F3E5F5] text-[#9C27B0]'
                            }`}
                          >
                            {uiType === 'dealership' ? 'Dealership' : 'Individual'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex px-3 py-1 rounded-[16px] text-[11px] font-medium ${
                              variant === 'active'
                                ? 'bg-[#E8F5E9] text-[#44C13C]'
                                : variant === 'repeat'
                                ? 'bg-[#FFF4E6] text-[#FF9500]'
                                : 'bg-[#FFEBEE] text-[#F44336]'
                            }`}
                          >
                            {statusLabel}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-1 text-xs text-[#717d8a]">
                            <div className="flex items-center gap-1">
                              <Phone size={12} className="text-[#717d8a]" />
                              <span>{customer.phone}</span>
                            </div>
                            {customer.email && (
                              <div className="flex items-center gap-1">
                                <Mail size={12} className="text-[#717d8a]" />
                                <span className="truncate">{customer.email}</span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-[#44C13C] whitespace-nowrap font-semibold">
                          {customer.total_revenue && customer.total_revenue > 0
                            ? `₹${customer.total_revenue.toLocaleString('en-IN')}`
                            : '₹0'}
                        </td>
                        <td className="px-6 py-4 text-sm text-[#717d8a] whitespace-nowrap">
                          {new Date(customer.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-sm text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              router.push(`/customers/${customer.id}`)
                            }}
                            className="text-[#de0510] hover:text-[#c00410] font-medium text-xs"
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    )
                  })}

                  {filteredCustomers.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-6 py-10 text-center text-sm text-[#717d8a]"
                      >
                        No customers found for this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-[#f1f1f1]">
              {filteredCustomers.map((customer) => {
                const uiType = getUiType(customer)
                const { label: statusLabel, variant } = getUiStatus(customer)

                return (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => handleRowClick(customer.id)}
                    className="w-full text-left px-4 py-4 bg-white hover:bg-[#fafafa] transition-colors"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-full bg-[#d8d8fe] flex items-center justify-center text-sm font-semibold text-[#242d35]">
                        {customer.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#242d35] truncate">
                          {customer.name}
                        </p>
                        {customer.email && (
                          <p className="text-xs text-[#717d8a] truncate">
                            {customer.email}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span
                        className={`inline-flex px-3 py-1 rounded-[16px] text-[11px] font-medium ${
                          uiType === 'dealership'
                            ? 'bg-[#E3F2FD] text-[#2196F3]'
                            : 'bg-[#F3E5F5] text-[#9C27B0]'
                        }`}
                      >
                        {uiType === 'dealership' ? 'Dealership' : 'Individual'}
                      </span>
                      <span
                        className={`inline-flex px-3 py-1 rounded-[16px] text-[11px] font-medium ${
                          variant === 'active'
                            ? 'bg-[#E8F5E9] text-[#44C13C]'
                            : variant === 'repeat'
                            ? 'bg-[#FFF4E6] text-[#FF9500]'
                            : 'bg-[#FFEBEE] text-[#F44336]'
                        }`}
                      >
                        {statusLabel}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-[#717d8a]">
                      <span>{customer.phone}</span>
                      <span>{new Date(customer.created_at).toLocaleDateString()}</span>
                    </div>
                  </button>
                )
              })}

              {filteredCustomers.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-[#717d8a]">
                  No customers found for this filter.
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Create Customer Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => !creating && setShowCreateModal(false)}
            />
            <div className="relative z-10 w-full max-w-3xl max-h-[90vh] mx-4 rounded-[20px] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.3)] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#eaecee] bg-white">
                <h2 className="text-lg md:text-xl font-semibold text-[#242d35]">
                  Create New Customer
                </h2>
                <button
                  type="button"
                  onClick={() => !creating && setShowCreateModal(false)}
                  className="w-8 h-8 rounded-full hover:bg-[#f5f5f5] flex items-center justify-center text-[#717d8a]"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              <form
                onSubmit={handleCreateCustomer}
                className="flex-1 overflow-y-auto px-6 py-4 space-y-5"
              >
                {/* Type toggle */}
                <div>
                  <p className="mb-2 text-sm font-medium text-[#242d35]">
                    Customer Type <span className="text-[#de0510]">*</span>
                  </p>
                  <div className="inline-flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setCreateForm((prev) => ({ ...prev, type: 'individual' }))
                      }
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        createForm.type === 'individual'
                          ? 'bg-[#de0510] text-white shadow-[0_2px_4px_rgba(222,5,16,0.2)]'
                          : 'bg-[#f5f5f5] text-[#717d8a] hover:bg-[#eaecee]'
                      }`}
                    >
                      Individual
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCreateForm((prev) => ({ ...prev, type: 'dealership' }))
                      }
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        createForm.type === 'dealership'
                          ? 'bg-[#de0510] text-white shadow-[0_2px_4px_rgba(222,5,16,0.2)]'
                          : 'bg-[#f5f5f5] text-[#717d8a] hover:bg-[#eaecee]'
                      }`}
                    >
                      Dealership
                    </button>
                  </div>
                </div>

                {/* Basic info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#242d35] mb-1">
                      {createForm.type === 'dealership'
                        ? 'Company / Showroom Name'
                        : 'Full Name'}{' '}
                      <span className="text-[#de0510]">*</span>
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-lg border border-[#eaecee] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#de0510]"
                      value={createForm.name}
                      onChange={(e) =>
                        setCreateForm((prev) => ({ ...prev, name: e.target.value }))
                      }
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#242d35] mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      className="w-full rounded-lg border border-[#eaecee] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#de0510]"
                      value={createForm.email}
                      onChange={(e) =>
                        setCreateForm((prev) => ({ ...prev, email: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#242d35] mb-1">
                      Phone <span className="text-[#de0510]">*</span>
                    </label>
                    <input
                      type="tel"
                      className="w-full rounded-lg border border-[#eaecee] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#de0510]"
                      value={createForm.phone}
                      onChange={(e) =>
                        setCreateForm((prev) => ({ ...prev, phone: e.target.value }))
                      }
                      required
                    />
                  </div>
                </div>

                {/* Location */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#242d35] mb-1">
                      City
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-lg border border-[#eaecee] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#de0510]"
                      value={createForm.city}
                      onChange={(e) =>
                        setCreateForm((prev) => ({ ...prev, city: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#242d35] mb-1">
                      State
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-lg border border-[#eaecee] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#de0510]"
                      value={createForm.state}
                      onChange={(e) =>
                        setCreateForm((prev) => ({ ...prev, state: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#242d35] mb-1">
                      Pincode
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-lg border border-[#eaecee] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#de0510]"
                      value={createForm.pincode}
                      onChange={(e) =>
                        setCreateForm((prev) => ({ ...prev, pincode: e.target.value }))
                      }
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-[#242d35] mb-1">
                    Notes
                  </label>
                  <textarea
                    className="w-full min-h-[80px] rounded-lg border border-[#eaecee] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#de0510] resize-none"
                    value={createForm.notes}
                    onChange={(e) =>
                      setCreateForm((prev) => ({ ...prev, notes: e.target.value }))
                    }
                  />
                </div>
              </form>

              {/* Sticky footer */}
              <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#eaecee] bg-[#fafafa]">
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => !creating && setShowCreateModal(false)}
                  className="px-4 py-2 rounded-[32px] border border-[#eaecee] bg-white text-sm font-medium text-[#242d35] hover:bg-[#f5f5f5] disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateCustomer}
                  disabled={creating}
                  className="px-5 py-2 rounded-[32px] bg-[#de0510] text-sm font-medium text-white shadow-[0_4px_12px_rgba(222,5,16,0.2)] hover:bg-[#c00410] disabled:opacity-60"
                >
                  {creating ? 'Creating...' : 'Create Customer'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Import modal – basic CSV uploader stub */}
        {showImportModal && (
          <div className="fixed inset-0 z-40 flex items-center justify-center">
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setShowImportModal(false)}
            />
            <div className="relative z-10 w-full max-w-2xl max-h-[80vh] mx-4 rounded-[20px] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.3)] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#eaecee] bg-white">
                <h2 className="text-lg font-semibold text-[#242d35]">
                  Import Customers (CSV)
                </h2>
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="w-8 h-8 rounded-full hover:bg-[#f5f5f5] flex items-center justify-center text-[#717d8a]"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 text-sm text-[#717d8a]">
                <p>
                  Upload a CSV file with columns like{' '}
                  <code className="bg-[#f5f5f5] px-1 rounded">name</code>,{' '}
                  <code className="bg-[#f5f5f5] px-1 rounded">phone</code>,{' '}
                  <code className="bg-[#f5f5f5] px-1 rounded">email</code>, and an optional{' '}
                  <code className="bg-[#f5f5f5] px-1 rounded">type</code> column
                  (values: <code>dealership</code> or <code>individual</code>).
                </p>
                <input
                  type="file"
                  accept=".csv"
                  className="w-full text-sm"
                  onChange={() => {
                    alert(
                      'CSV import UI is ready. The actual bulk create wiring can reuse existing leads upload patterns without changing any current behaviour.'
                    )
                  }}
                />
              </div>
              <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#eaecee] bg-[#fafafa]">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 rounded-[32px] border border-[#eaecee] bg-white text-sm font-medium text-[#242d35] hover:bg-[#f5f5f5]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
