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
  Search,
  RotateCcw,
  ChevronRight,
} from 'lucide-react'
import { cachedFetch } from '@/lib/api-client'

type CustomerType = 'dealership' | 'individual'

interface Customer {
  id: string
  name: string
  phone: string
  email: string | null
  customer_type: string
  tags: string[] | null
  lead_id?: string | null
  created_at: string
  total_revenue?: number
  source?: 'external'
  car_number?: string | null
  chassis_number?: string | null
  service_type?: string | null
  series?: string | null
  service_date?: string | null
  service_location?: string | null
  dealer_name?: string | null
  warranty_years?: number | null
  ppf_warranty_years?: number | null
  car_name?: string | null
  car_model?: string | null
  car_photo_url?: string | null
  chassis_photo_url?: string | null
  dealer_invoice_url?: string | null
}

type FilterType = 'all' | 'dealership' | 'individual'

/** CRM row from a converted lead, external warranty import, or manually created. */
type RecordOrigin = 'all' | 'lead_conversion' | 'warranty_claim' | 'crm_direct'

const DEALER_UNASSIGNED = '__unassigned__'

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
  const [recordOrigin, setRecordOrigin] = useState<RecordOrigin>('all')
  const [dealerFilter, setDealerFilter] = useState<string>('')
  const [activeStatsFilter, setActiveStatsFilter] = useState<'dealership' | 'individual' | 'revenue' | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [dealersExpanded, setDealersExpanded] = useState(true)
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
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)

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

  // Deep link from dashboard (e.g. /customers?origin=warranty_claim)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const origin = new URLSearchParams(window.location.search).get('origin')
    if (origin === 'warranty_claim') {
      setRecordOrigin('warranty_claim')
    }
  }, [])

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
      const response = await cachedFetch('/api/customers')
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

  function getRecordOrigin(customer: Customer): Exclude<RecordOrigin, 'all'> {
    if (customer.source === 'external') return 'warranty_claim'
    if (customer.lead_id) return 'lead_conversion'
    return 'crm_direct'
  }

  function getSourcePresentation(customer: Customer): { label: string; className: string } {
    const o = getRecordOrigin(customer)
    if (o === 'warranty_claim') {
      return {
        label: 'Warranty claim',
        className: 'bg-amber-100 text-amber-900',
      }
    }
    if (o === 'lead_conversion') {
      return {
        label: 'From lead',
        className: 'bg-[#E8F5E9] text-[#2E7D32]',
      }
    }
    return {
      label: 'Direct CRM',
      className: 'bg-[#E3F2FD] text-[#1565C0]',
    }
  }

  const warrantyDealerNames = useMemo(() => {
    const names = new Set<string>()
    customers.forEach((c) => {
      if (c.source === 'external' && c.dealer_name?.trim()) names.add(c.dealer_name.trim())
    })
    return Array.from(names).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [customers])

  const warrantyByDealer = useMemo(() => {
    const map = new Map<string, number>()
    let unassigned = 0
    customers.forEach((c) => {
      if (c.source !== 'external') return
      const d = c.dealer_name?.trim()
      if (!d) unassigned += 1
      else map.set(d, (map.get(d) || 0) + 1)
    })
    const rows = Array.from(map.entries())
      .map(([dealer, count]) => ({ dealer, count }))
      .sort((a, b) => b.count - a.count || a.dealer.localeCompare(b.dealer))
    return { rows, unassigned }
  }, [customers])

  const filteredCustomers = useMemo(() => {
    let filtered = customers

    if (recordOrigin !== 'all') {
      filtered = filtered.filter((c) => getRecordOrigin(c) === recordOrigin)
    }

    if (dealerFilter === DEALER_UNASSIGNED) {
      filtered = filtered.filter(
        (c) => c.source === 'external' && !c.dealer_name?.trim()
      )
    } else if (dealerFilter) {
      filtered = filtered.filter(
        (c) =>
          c.dealer_name?.trim() === dealerFilter ||
          (c.source !== 'external' && c.dealer_name?.trim() === dealerFilter)
      )
    }

    // Apply stats card filter
    if (activeStatsFilter === 'dealership') {
      filtered = filtered.filter((c) => getUiType(c) === 'dealership')
    } else if (activeStatsFilter === 'individual') {
      filtered = filtered.filter((c) => getUiType(c) === 'individual')
    } else if (activeStatsFilter === 'revenue') {
      filtered = filtered.filter((c) => (c.total_revenue || 0) > 0)
    }

    // Apply main filter
    if (filter === 'all') return filtered
    return filtered.filter((c) => getUiType(c) === filter)
  }, [customers, filter, activeStatsFilter, recordOrigin, dealerFilter])

  const searchFilteredCustomers = useMemo(() => {
    const raw = searchQuery.trim().toLowerCase()
    if (!raw) return filteredCustomers
    const terms = raw.split(/\s+/).filter(Boolean)
    return filteredCustomers.filter((c) => {
      const hay = [
        c.name,
        c.phone,
        c.email,
        c.dealer_name,
        c.car_model,
        c.car_name,
        c.service_type,
        c.chassis_number,
        c.car_number,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return terms.every((term) => hay.includes(term))
    })
  }, [filteredCustomers, searchQuery])

  const totalPages = Math.max(1, Math.ceil(searchFilteredCustomers.length / itemsPerPage))
  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return searchFilteredCustomers.slice(start, start + itemsPerPage)
  }, [searchFilteredCustomers, currentPage, itemsPerPage])

  const hasActiveFilters =
    recordOrigin !== 'all' ||
    dealerFilter !== '' ||
    activeStatsFilter !== null ||
    filter !== 'all' ||
    searchQuery.trim() !== ''

  function clearAllFilters() {
    setRecordOrigin('all')
    setDealerFilter('')
    setActiveStatsFilter(null)
    setFilter('all')
    setSearchQuery('')
  }

  useEffect(() => {
    setCurrentPage(1)
  }, [filter, activeStatsFilter, itemsPerPage, recordOrigin, dealerFilter, searchQuery])

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

    const leadConversions = customers.filter(
      (c) => c.source !== 'external' && c.lead_id
    ).length
    const warrantyClaims = customers.filter((c) => c.source === 'external').length
    const crmDirect = customers.filter(
      (c) => c.source !== 'external' && !c.lead_id
    ).length

    return {
      totalCustomers: total,
      dealerships,
      individuals,
      totalRevenue,
      leadConversions,
      warrantyClaims,
      crmDirect,
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

      const response = await cachedFetch('/api/customers', {
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
        <div className="min-h-screen bg-[#f5f5f5] p-4 md:p-6 lg:p-8">
          <div className="max-w-[1600px] mx-auto space-y-6 animate-pulse">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="space-y-2">
                <div className="h-9 w-64 rounded-lg bg-[#eaecee]" />
                <div className="h-4 w-96 max-w-full rounded bg-[#eaecee]" />
              </div>
              <div className="flex gap-3">
                <div className="h-10 w-24 rounded-full bg-[#eaecee]" />
                <div className="h-10 w-36 rounded-full bg-[#eaecee]/80" />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-28 rounded-xl bg-white border border-[#eaecee]" />
              ))}
            </div>
            <div className="h-40 rounded-xl bg-white border border-[#eaecee]" />
            <div className="h-[420px] rounded-xl bg-white border border-[#eaecee]" />
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="p-4 md:p-6 lg:p-8 bg-[#f5f5f5] min-h-screen w-full">
        <div className="max-w-[1600px] mx-auto space-y-5 md:space-y-7 w-full">
          {/* Header */}
          <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-[26px] md:text-[32px] font-bold text-[#242d35] tracking-tight">
                Customers
              </h1>
              <p className="mt-1 text-sm text-[#717d8a] max-w-xl leading-relaxed">
                Converted leads, direct CRM entries, and warranty records—search and filter in one place.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 sm:gap-3 justify-stretch sm:justify-end shrink-0">
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-[#eaecee] bg-white px-4 py-2.5 text-sm font-medium text-[#242d35] hover:bg-[#fafafa] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#de0510] focus-visible:ring-offset-2"
              >
                <Upload size={16} aria-hidden />
                Import
              </button>
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#de0510] px-5 py-2.5 text-sm font-medium text-white shadow-[0_4px_12px_rgba(222,5,16,0.2)] hover:bg-[#c00410] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#de0510] focus-visible:ring-offset-2"
              >
                <Plus size={16} aria-hidden />
                New customer
              </button>
            </div>
          </header>

          {/* Stats cards - 2 per row on mobile, filterable */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <button
              type="button"
              title="Clear all filters and show the full list"
              onClick={clearAllFilters}
              className="group rounded-xl bg-white border border-[#eaecee] p-4 md:p-5 flex items-start justify-between shadow-sm transition-all text-left hover:border-[#2196F3]/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2196F3] focus-visible:ring-offset-2"
            >
              <div>
                <p className="text-[11px] font-semibold text-[#717d8a] uppercase tracking-wider">
                  Total in system
                </p>
                <p className="mt-2 text-2xl font-bold text-[#242d35] tabular-nums">
                  {stats.totalCustomers}
                </p>
                <p className="mt-1 text-[11px] text-[#2196F3] font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  Reset filters
                </p>
              </div>
              <div className="w-10 h-10 rounded-full bg-[#E3F2FD] flex items-center justify-center flex-shrink-0">
                <Users size={20} className="text-[#2196F3]" aria-hidden />
              </div>
            </button>

            <button
              type="button"
              aria-pressed={activeStatsFilter === 'dealership'}
              onClick={() => {
                const newFilter = activeStatsFilter === 'dealership' ? null : 'dealership'
                setActiveStatsFilter(newFilter)
                if (newFilter === 'dealership') {
                  setFilter('dealership')
                } else {
                  setFilter('all')
                }
              }}
              className={`rounded-xl bg-white border p-4 md:p-5 flex items-start justify-between shadow-sm transition-all text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#44C13C] focus-visible:ring-offset-2 ${
                activeStatsFilter === 'dealership' ? 'border-[#44C13C] ring-2 ring-[#44C13C]/30 bg-green-50/80' : 'border-[#eaecee] hover:border-[#44C13C]/30'
              }`}
            >
              <div>
                <p className="text-[11px] font-semibold text-[#717d8a] uppercase tracking-wider">
                  Dealerships
                </p>
                <p className="mt-2 text-2xl font-bold text-[#242d35] tabular-nums">
                  {stats.dealerships}
                </p>
              </div>
              <div className="w-10 h-10 rounded-full bg-[#E8F5E9] flex items-center justify-center flex-shrink-0">
                <Building2 size={20} className="text-[#44C13C]" aria-hidden />
              </div>
            </button>

            <button
              type="button"
              aria-pressed={activeStatsFilter === 'individual'}
              onClick={() => {
                const newFilter = activeStatsFilter === 'individual' ? null : 'individual'
                setActiveStatsFilter(newFilter)
                if (newFilter === 'individual') {
                  setFilter('individual')
                } else {
                  setFilter('all')
                }
              }}
              className={`rounded-xl bg-white border p-4 md:p-5 flex items-start justify-between shadow-sm transition-all text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9C27B0] focus-visible:ring-offset-2 ${
                activeStatsFilter === 'individual' ? 'border-[#9C27B0] ring-2 ring-[#9C27B0]/30 bg-purple-50/80' : 'border-[#eaecee] hover:border-[#9C27B0]/30'
              }`}
            >
              <div>
                <p className="text-[11px] font-semibold text-[#717d8a] uppercase tracking-wider">
                  Individuals
                </p>
                <p className="mt-2 text-2xl font-bold text-[#242d35] tabular-nums">
                  {stats.individuals}
                </p>
              </div>
              <div className="w-10 h-10 rounded-full bg-[#F3E5F5] flex items-center justify-center flex-shrink-0">
                <User size={20} className="text-[#9C27B0]" aria-hidden />
              </div>
            </button>

            <button
              type="button"
              aria-pressed={activeStatsFilter === 'revenue'}
              onClick={() =>
                setActiveStatsFilter((prev) => (prev === 'revenue' ? null : 'revenue'))
              }
              className={`rounded-xl bg-white border p-4 md:p-5 flex items-start justify-between shadow-sm transition-all text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF513A] focus-visible:ring-offset-2 ${
                activeStatsFilter === 'revenue' ? 'border-[#FF513A] ring-2 ring-[#FF513A]/30 bg-orange-50/80' : 'border-[#eaecee] hover:border-[#FF513A]/30'
              }`}
            >
              <div>
                <p className="text-[11px] font-semibold text-[#717d8a] uppercase tracking-wider">
                  Revenue (paid)
                </p>
                <p className="mt-2 text-xl font-bold text-[#242d35] tabular-nums">
                  ₹{stats.totalRevenue.toLocaleString('en-IN')}
                </p>
                <p className="mt-1 text-[11px] text-[#717d8a]">Paid orders only</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-[#FFE8D7] flex items-center justify-center flex-shrink-0">
                <IndianRupee size={20} className="text-[#FF513A]" aria-hidden />
              </div>
            </button>
          </section>

          {/* Lead vs warranty vs direct + dealer scope */}
          <section className="rounded-xl bg-white border border-[#eaecee] shadow-sm p-4 md:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="text-sm font-semibold text-[#242d35]">Source &amp; dealer</h2>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="inline-flex items-center gap-2 self-start sm:self-auto text-sm font-medium text-[#de0510] hover:text-[#c00410] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#de0510] focus-visible:ring-offset-2 rounded-lg px-2 py-1 -ml-2"
                >
                  <RotateCcw size={14} aria-hidden />
                  Clear all filters
                </button>
              )}
            </div>
            <div>
              <p className="text-[11px] font-semibold text-[#717d8a] uppercase tracking-wider mb-2.5">
                Record source
              </p>
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label="Filter by record source"
              >
                {(
                  [
                    ['all', 'All records', stats.totalCustomers],
                    ['lead_conversion', 'From lead', stats.leadConversions],
                    ['warranty_claim', 'Warranty claims', stats.warrantyClaims],
                    ['crm_direct', 'Direct CRM', stats.crmDirect],
                  ] as const
                ).map(([key, label, count]) => {
                  const active = recordOrigin === key
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setRecordOrigin((prev) => (prev === key ? 'all' : key))}
                      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs md:text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#de0510] focus-visible:ring-offset-2 ${
                        active
                          ? 'border-[#de0510] bg-[#fff5f5] text-[#de0510] shadow-sm'
                          : 'border-[#eaecee] bg-[#fafafa] text-[#4f5b67] hover:bg-white hover:border-[#d0d5d9]'
                      }`}
                    >
                      <span>{label}</span>
                      <span className="tabular-nums text-[#717d8a] font-normal">({count})</span>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-6">
              <div className="flex-1 min-w-0">
                <label
                  htmlFor="customers-dealer-filter"
                  className="text-[11px] font-semibold text-[#717d8a] uppercase tracking-wider block mb-1.5"
                >
                  Dealer (warranty claims)
                </label>
                <select
                  id="customers-dealer-filter"
                  value={dealerFilter}
                  onChange={(e) => setDealerFilter(e.target.value)}
                  className="w-full sm:max-w-md rounded-lg border border-[#eaecee] px-3 py-2.5 text-sm text-[#242d35] bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-transparent"
                >
                  <option value="">All dealers</option>
                  {warrantyByDealer.unassigned > 0 && (
                    <option value={DEALER_UNASSIGNED}>
                      No dealer on file ({warrantyByDealer.unassigned})
                    </option>
                  )}
                  {warrantyDealerNames.map((name) => (
                    <option key={name} value={name}>
                      {name} ({warrantyByDealer.rows.find((r) => r.dealer === name)?.count ?? 0})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {stats.warrantyClaims > 0 && (
              <div>
                <button
                  type="button"
                  className="md:hidden flex w-full items-center justify-between text-left text-[11px] font-semibold text-[#717d8a] uppercase tracking-wider mb-2 py-1"
                  onClick={() => setDealersExpanded((e) => !e)}
                  aria-expanded={dealersExpanded}
                >
                  Warranty claims by dealer
                  <span className="text-[#242d35] normal-case font-medium text-xs">
                    {dealersExpanded ? 'Hide' : 'Show'}
                  </span>
                </button>
                <p className="hidden md:block text-[11px] font-semibold text-[#717d8a] uppercase tracking-wider mb-2.5">
                  Quick pick by dealer
                </p>
                <div
                  className={`flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory md:flex-wrap md:overflow-visible ${
                    dealersExpanded ? 'max-h-[200px] flex-wrap overflow-y-auto md:max-h-none' : 'max-h-0 overflow-hidden md:max-h-none md:overflow-visible'
                  }`}
                >
                  {warrantyByDealer.unassigned > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setRecordOrigin('warranty_claim')
                        setDealerFilter(DEALER_UNASSIGNED)
                      }}
                      className={`snap-start shrink-0 text-left rounded-lg border px-3 py-2 text-xs min-w-[100px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#de0510] focus-visible:ring-offset-2 ${
                        dealerFilter === DEALER_UNASSIGNED
                          ? 'border-amber-400 bg-amber-50 text-amber-950 shadow-sm'
                          : 'border-[#eaecee] bg-[#fafafa] text-[#4f5b67] hover:border-amber-300/60'
                      }`}
                    >
                      <span className="font-medium block">No dealer</span>
                      <span className="text-[#717d8a] tabular-nums">{warrantyByDealer.unassigned}</span>
                    </button>
                  )}
                  {warrantyByDealer.rows.map(({ dealer, count }) => (
                    <button
                      key={dealer}
                      type="button"
                      onClick={() => {
                        setRecordOrigin('warranty_claim')
                        setDealerFilter(dealer)
                      }}
                      className={`snap-start shrink-0 text-left rounded-lg border px-3 py-2 text-xs max-w-[200px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#de0510] focus-visible:ring-offset-2 ${
                        dealerFilter === dealer
                          ? 'border-amber-400 bg-amber-50 text-amber-950 shadow-sm'
                          : 'border-[#eaecee] bg-[#fafafa] text-[#4f5b67] hover:border-amber-300/60'
                      }`}
                    >
                      <span className="font-medium block truncate" title={dealer}>
                        {dealer}
                      </span>
                      <span className="text-[#717d8a] tabular-nums">{count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Search + type + summary */}
          <section className="flex flex-col lg:flex-row lg:items-center gap-4">
            <div className="relative flex-1 min-w-0">
              <Search
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#717d8a] pointer-events-none"
                size={18}
                aria-hidden
              />
              <input
                type="search"
                placeholder="Search name, phone, email, dealer, vehicle…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-full border border-[#eaecee] bg-white pl-11 pr-4 py-2.5 text-sm text-[#242d35] placeholder:text-[#9aa5b1] shadow-sm focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-transparent"
                aria-label="Search customers"
              />
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 shrink-0">
              <div
                className="inline-flex items-center gap-1 rounded-full bg-white border border-[#eaecee] p-1 shadow-sm"
                role="group"
                aria-label="Customer type"
              >
                {(['all', 'dealership', 'individual'] as FilterType[]).map((key) => {
                  const isActive = filter === key
                  const label =
                    key === 'all'
                      ? `All types`
                      : key === 'dealership'
                      ? `Dealership`
                      : `Individual`
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => setFilter(key)}
                      className={`px-3.5 py-2 rounded-full text-xs sm:text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#de0510] focus-visible:ring-offset-2 ${
                        isActive
                          ? 'bg-[#de0510] text-white shadow-sm'
                          : 'text-[#717d8a] hover:bg-[#fafafa]'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              <div className="hidden lg:inline-flex items-center gap-2 text-xs text-[#717d8a] px-2">
                <Filter size={14} aria-hidden />
                <span>
                  <span className="font-semibold text-[#242d35] tabular-nums">
                    {searchFilteredCustomers.length}
                  </span>
                  {' · '}
                  {searchFilteredCustomers.length === customers.length
                    ? 'total'
                    : `of ${customers.length}`}
                </span>
              </div>
            </div>
          </section>

          {/* Table */}
          <section className="rounded-xl bg-white border border-[#eaecee] shadow-sm overflow-hidden">
            <div className="md:hidden px-4 py-3 border-b border-[#eaecee] bg-[#fafafa] flex items-center justify-between text-xs text-[#4f5b67]">
              <span>
                <span className="font-semibold text-[#242d35] tabular-nums">
                  {searchFilteredCustomers.length}
                </span>{' '}
                {searchFilteredCustomers.length === 1 ? 'customer' : 'customers'}
              </span>
              {searchQuery.trim() && (
                <span className="text-[#717d8a] truncate max-w-[55%]" title={searchQuery}>
                  “{searchQuery.trim()}”
                </span>
              )}
            </div>
            <div className="hidden md:block overflow-x-auto max-h-[min(70vh,900px)] overflow-y-auto">
              <table className="min-w-full whitespace-nowrap">
                <thead className="bg-[#fafafa] sticky top-0 z-10 shadow-[0_1px_0_#eaecee]">
                  <tr>
                    <th
                      scope="col"
                      className="px-6 py-3.5 text-left text-[11px] font-semibold text-[#4f5b67] uppercase tracking-wide sticky left-0 z-30 bg-[#fafafa] shadow-[4px_0_12px_-4px_rgba(0,0,0,0.06)]"
                    >
                      Customer
                    </th>
                    <th scope="col" className="px-6 py-3.5 text-left text-[11px] font-semibold text-[#4f5b67] uppercase tracking-wide">
                      Source
                    </th>
                    <th scope="col" className="px-6 py-3.5 text-left text-[11px] font-semibold text-[#4f5b67] uppercase tracking-wide">
                      Type
                    </th>
                    <th scope="col" className="px-6 py-3.5 text-left text-[11px] font-semibold text-[#4f5b67] uppercase tracking-wide">
                      Status
                    </th>
                    <th scope="col" className="px-6 py-3.5 text-left text-[11px] font-semibold text-[#4f5b67] uppercase tracking-wide">
                      Contact
                    </th>
                    <th scope="col" className="px-6 py-3.5 text-left text-[11px] font-semibold text-[#4f5b67] uppercase tracking-wide">
                      Dealer
                    </th>
                    <th scope="col" className="px-6 py-3.5 text-left text-[11px] font-semibold text-[#4f5b67] uppercase tracking-wide">
                      Service
                    </th>
                    <th scope="col" className="px-6 py-3.5 text-left text-[11px] font-semibold text-[#4f5b67] uppercase tracking-wide">
                      Vehicle
                    </th>
                    <th scope="col" className="px-6 py-3.5 text-left text-[11px] font-semibold text-[#4f5b67] uppercase tracking-wide">
                      Purchase
                    </th>
                    <th scope="col" className="px-6 py-3.5 text-left text-[11px] font-semibold text-[#4f5b67] uppercase tracking-wide">
                      Created
                    </th>
                    <th scope="col" className="px-6 py-3.5 text-right text-[11px] font-semibold text-[#4f5b67] uppercase tracking-wide">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f1f1] bg-white">
                  {paginatedCustomers.map((customer) => {
                    const uiType = getUiType(customer)
                    const { label: statusLabel, variant } = getUiStatus(customer)
                    const sourceUi = getSourcePresentation(customer)

                    return (
                      <tr
                        key={customer.id}
                        className="group hover:bg-[#fafafa] cursor-pointer transition-colors"
                        onClick={() => handleRowClick(customer.id)}
                      >
                        <td className="px-6 py-4 sticky left-0 z-[1] bg-white group-hover:bg-[#fafafa] shadow-[4px_0_12px_-4px_rgba(0,0,0,0.08)] transition-colors">
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
                            className={`inline-flex px-3 py-1 rounded-[16px] text-[11px] font-medium ${sourceUi.className}`}
                          >
                            {sourceUi.label}
                          </span>
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
                        <td className="px-6 py-4 text-sm text-[#4f5b67] max-w-[180px]">
                          <span className="truncate block" title={customer.dealer_name ?? ''}>
                            {customer.dealer_name || '—'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-[#4f5b67] whitespace-nowrap">
                          {customer.service_type ? (
                            <span className="capitalize">{customer.service_type}</span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-[#4f5b67] max-w-[140px]">
                          <span className="truncate block" title={customer.car_model ?? ''}>
                            {customer.car_model || customer.car_name || '—'}
                          </span>
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
                            className="inline-flex items-center rounded-lg px-2.5 py-1.5 text-[#de0510] hover:text-[#c00410] hover:bg-red-50 font-medium text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#de0510] focus-visible:ring-offset-2"
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    )
                  })}

                  {paginatedCustomers.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-6 py-16 text-center">
                        <div className="max-w-md mx-auto space-y-3">
                          <p className="text-base font-semibold text-[#242d35]">
                            No customers match
                          </p>
                          <p className="text-sm text-[#717d8a] leading-relaxed">
                            {customers.length === 0
                              ? 'Add your first customer or check that your data sources are connected.'
                              : hasActiveFilters || searchQuery.trim()
                              ? 'Try clearing filters or searching with different keywords.'
                              : 'Nothing to show in this view.'}
                          </p>
                          {(hasActiveFilters || searchQuery.trim()) && customers.length > 0 && (
                            <button
                              type="button"
                              onClick={clearAllFilters}
                              className="inline-flex items-center gap-2 mt-2 rounded-full border border-[#eaecee] bg-white px-4 py-2 text-sm font-medium text-[#242d35] hover:bg-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#de0510] focus-visible:ring-offset-2"
                            >
                              <RotateCcw size={14} aria-hidden />
                              Reset search &amp; filters
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination (desktop) */}
            <div className="hidden md:flex flex-wrap items-center justify-between gap-4 px-4 py-3 border-t border-[#eaecee] bg-[#fafafa]">
              <div className="flex items-center gap-3">
                <span className="text-sm text-[#4f5b67]">Show</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value))
                    setCurrentPage(1)
                  }}
                  className="rounded-lg border border-[#eaecee] px-3 py-1.5 text-sm text-[#242d35] bg-white focus:ring-2 focus:ring-[#de0510] focus:border-transparent"
                >
                  {[10, 25, 50, 100].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <span className="text-sm text-[#4f5b67]">per page</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-[#717d8a]">
                  {searchFilteredCustomers.length === 0
                    ? '0 results'
                    : `${(currentPage - 1) * itemsPerPage + 1}–${Math.min(currentPage * itemsPerPage, searchFilteredCustomers.length)} of ${searchFilteredCustomers.length}`}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-sm font-medium text-[#4f5b67] bg-white border border-[#eaecee] rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-sm font-medium text-[#4f5b67] bg-white border border-[#eaecee] rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-[#f1f1f1]">
              {paginatedCustomers.map((customer) => {
                const uiType = getUiType(customer)
                const { label: statusLabel, variant } = getUiStatus(customer)
                const sourceUi = getSourcePresentation(customer)

                return (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => handleRowClick(customer.id)}
                    className="w-full text-left px-4 py-4 bg-white hover:bg-[#fafafa] transition-colors flex items-start gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#de0510]"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#d8d8fe] flex items-center justify-center text-sm font-semibold text-[#242d35] shrink-0">
                      {customer.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#242d35] truncate">
                          {customer.name}
                        </p>
                        {customer.email && (
                          <p className="text-xs text-[#717d8a] truncate">
                            {customer.email}
                          </p>
                        )}
                        {(customer.dealer_name || customer.service_type || customer.car_model || customer.car_name) && (
                          <p className="text-xs text-[#4f5b67] mt-1 space-y-0.5">
                            {customer.dealer_name && <span className="block truncate">Dealer: {customer.dealer_name}</span>}
                            {(customer.service_type || customer.car_model || customer.car_name) && (
                              <span className="block truncate">
                                {[customer.service_type, customer.car_model || customer.car_name].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="w-5 h-5 text-[#c5cdd5] shrink-0 mt-0.5" aria-hidden />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span
                        className={`inline-flex px-3 py-1 rounded-[16px] text-[11px] font-medium ${sourceUi.className}`}
                      >
                        {sourceUi.label}
                      </span>
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
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#717d8a]">
                      <span className="font-medium text-[#4f5b67]">{customer.phone}</span>
                      <div className="flex items-center gap-3">
                        {(customer.total_revenue || 0) > 0 && (
                          <span className="text-[#44C13C] font-semibold tabular-nums">
                            ₹{(customer.total_revenue || 0).toLocaleString('en-IN')}
                          </span>
                        )}
                        <span>{new Date(customer.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    </div>
                  </button>
                )
              })}

              {paginatedCustomers.length === 0 && (
                <div className="px-4 py-12 text-center space-y-3">
                  <p className="text-sm font-semibold text-[#242d35]">No customers match</p>
                  <p className="text-xs text-[#717d8a] max-w-xs mx-auto leading-relaxed">
                    {customers.length === 0
                      ? 'Add a customer or verify your connection.'
                      : 'Adjust filters or reset to see everyone.'}
                  </p>
                  {(hasActiveFilters || searchQuery.trim()) && customers.length > 0 && (
                    <button
                      type="button"
                      onClick={clearAllFilters}
                      className="inline-flex items-center gap-2 rounded-full border border-[#eaecee] bg-white px-4 py-2 text-xs font-medium text-[#242d35]"
                    >
                      <RotateCcw size={12} aria-hidden />
                      Reset all
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Pagination (mobile) */}
            <div className="md:hidden flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-[#eaecee] bg-[#fafafa]">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#4f5b67]">Show</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value))
                    setCurrentPage(1)
                  }}
                  className="rounded-lg border border-[#eaecee] px-2 py-1 text-xs text-[#242d35] bg-white"
                >
                  {[10, 25, 50, 100].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2 py-1 text-xs font-medium text-[#4f5b67] bg-white border rounded-lg disabled:opacity-50"
                >
                  Prev
                </button>
                <span className="text-xs text-[#717d8a]">
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2 py-1 text-xs font-medium text-[#4f5b67] bg-white border rounded-lg disabled:opacity-50"
                >
                  Next
                </button>
              </div>
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
                id="create-customer-form"
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
                  type="submit"
                  form="create-customer-form"
                  disabled={creating}
                  className="px-5 py-2 rounded-[32px] bg-[#de0510] text-sm font-medium text-white shadow-[0_4px_12px_rgba(222,5,16,0.2)] hover:bg-[#c00410] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#de0510] focus-visible:ring-offset-2"
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
