'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import Image from 'next/image'
import Layout from '@/components/Layout'

interface Lead {
  id: string
  lead_id: string
  name: string
  phone: string
  email: string | null
  source: string
  status: string
  interest_level: 'hot' | 'warm' | 'cold' | null
  assigned_user: {
    id: string
    name: string
    email: string
    profile_picture?: string
  } | null
  created_at: string
  first_contact_at: string | null
  updated_at: string
}

interface LeadStats {
  untouched: number
  hotLeads: number
  conversions: number
}

const sourceLogos: Record<string, string> = {
  meta: '/assets/icons/meta-logo.svg',
  whatsapp: '/assets/icons/whatsapp-logo.svg',
  form: '/assets/icons/form-logo.svg',
  manual: '/assets/icons/manual-logo.svg',
  ivr: '/assets/icons/ivr-logo.svg',
}

const sourceLabels: Record<string, string> = {
  meta: 'Meta',
  whatsapp: 'WhatsApp',
  form: 'Form',
  manual: 'Manual',
  ivr: 'IVR',
}

export default function LeadsPage() {
  const router = useRouter()
  const [leads, setLeads] = useState<Lead[]>([])
  const [stats, setStats] = useState<LeadStats>({ untouched: 0, hotLeads: 0, conversions: 0 })
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [totalLeads, setTotalLeads] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'table' | 'kanban' | 'card'>('table')
  const [kanbanGroupBy, setKanbanGroupBy] = useState<string>('Lead Stage')

  useEffect(() => {
    checkAuth()
    fetchLeads()
    fetchStats()
  }, [currentPage, rowsPerPage])

  async function checkAuth() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
    }
  }

  async function fetchStats() {
    try {
      const response = await fetch('/api/leads')
      if (response.ok) {
        const data = await response.json()
        const allLeads = data.leads || []
        
        // Calculate stats
        const untouched = allLeads.filter((lead: Lead) => lead.status === 'new').length
        const hotLeads = allLeads.filter((lead: Lead) => lead.interest_level === 'hot').length
        const converted = allLeads.filter((lead: Lead) => lead.status === 'converted').length
        const total = allLeads.length
        const conversions = total > 0 ? Math.round((converted / total) * 100) : 0
        
        setStats({ untouched, hotLeads, conversions })
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }

  async function fetchLeads() {
    try {
      const offset = (currentPage - 1) * rowsPerPage
      const response = await fetch(`/api/leads?limit=${rowsPerPage}&offset=${offset}`)
      if (response.ok) {
        const data = await response.json()
        setLeads(data.leads || [])
        setTotalLeads(data.total || data.leads?.length || 0)
      }
    } catch (error) {
      console.error('Failed to fetch leads:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      new: 'bg-blue-100 text-blue-800',
      negotiation: 'bg-orange-100 text-orange-800',
      interested: 'bg-yellow-100 text-yellow-800',
      quotation_shared: 'bg-yellow-100 text-yellow-800',
      qualified: 'bg-green-100 text-green-800',
      converted: 'bg-green-100 text-green-800',
      lost: 'bg-gray-100 text-gray-800',
      unqualified: 'bg-gray-100 text-gray-800',
    }
    // Map "interested" and "quotation_shared" to "In review" (yellow)
    if (status === 'interested' || status === 'quotation_shared') {
      return 'bg-yellow-100 text-yellow-800'
    }
    // Map "converted" to "Approved" (green)
    if (status === 'converted') {
      return 'bg-green-100 text-green-800'
    }
    // Map "lost" to "Closed" (grey)
    if (status === 'lost') {
      return 'bg-gray-100 text-gray-800'
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      new: 'New',
      negotiation: 'Negotiation',
      interested: 'In review',
      quotation_shared: 'In review',
      qualified: 'Approved',
      converted: 'Approved',
      lost: 'Closed',
      unqualified: 'Closed',
    }
    return labels[status] || status.replace('_', ' ')
  }

  const getTimeAgo = (dateString: string | null) => {
    if (!dateString) return 'Never'
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)

    if (diffHours < 1) return 'Just now'
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
  }

  const filteredLeads = leads.filter((lead) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      lead.name.toLowerCase().includes(query) ||
      lead.phone.includes(query) ||
      lead.email?.toLowerCase().includes(query) ||
      lead.lead_id.toLowerCase().includes(query)
    )
  })

  const totalPages = Math.ceil(totalLeads / rowsPerPage)

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-lg">Loading...</div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="min-h-screen bg-white">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-sm">
            <Link href="/dashboard" className="text-gray-500 hover:text-gray-700">
              Leads
            </Link>
            <span className="text-gray-400">/</span>
            <span className="text-red-600 font-medium">My Leads</span>
          </div>
          <div className="flex items-center space-x-4">
          <Link
            href="/leads/new"
              className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors font-medium"
          >
              New Lead +
          </Link>
            <button className="text-gray-600 hover:text-gray-800">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>
            <button className="text-gray-600 hover:text-gray-800">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-white rounded-[8px] border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Untouched</p>
                  <p className="text-3xl font-bold text-gray-900">{stats.untouched}</p>
                </div>
                <div className="relative w-16 h-16">
                  <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="28" fill="none" stroke="#e5e7eb" strokeWidth="4" />
                    <circle
                      cx="32"
                      cy="32"
                      r="28"
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="4"
                      strokeDasharray={`${(stats.untouched / 300) * 175.9} 175.9`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Hot Leads</p>
                  <p className="text-3xl font-bold text-gray-900">{stats.hotLeads}</p>
                </div>
                <div className="relative w-16 h-16">
                  <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="28" fill="none" stroke="#e5e7eb" strokeWidth="4" />
                    <circle
                      cx="32"
                      cy="32"
                      r="28"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="4"
                      strokeDasharray={`${(stats.hotLeads / 300) * 175.9} 175.9`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Conversions</p>
                  <p className="text-3xl font-bold text-gray-900">{stats.conversions}%</p>
                </div>
                <div className="relative w-16 h-16">
                  <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="28" fill="none" stroke="#e5e7eb" strokeWidth="4" />
                    <circle
                      cx="32"
                      cy="32"
                      r="28"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="4"
                      strokeDasharray={`${(stats.conversions / 100) * 175.9} 175.9`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Filters and Actions */}
          <div className="bg-white rounded-[8px] border border-gray-200 p-4 mb-6">
            <div className="flex flex-wrap items-center gap-4">
              <button className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                <span className="text-sm">Filter by</span>
              </button>
              <button className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                </svg>
                <span className="text-sm">Sort by</span>
              </button>
              <div className="flex-1 min-w-[200px] relative">
                <input
                  type="text"
                  placeholder="Try 'Miami invoice'"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              {/* Group by dropdown for Kanban view */}
              {viewMode === 'kanban' && (
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-700">Group by:</span>
                  <select
                    value={kanbanGroupBy}
                    onChange={(e) => setKanbanGroupBy(e.target.value)}
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="Lead Stage">Lead Stage</option>
                    <option value="Assigned To">Assigned To</option>
                    <option value="Lead Type">Lead Type</option>
                    <option value="Source">Source</option>
                  </select>
                </div>
              )}
              {/* View Options */}
              <div className="flex items-center space-x-1 border border-gray-300 rounded-md p-1">
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 rounded ${viewMode === 'table' ? 'bg-red-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                  title="Table view"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                </button>
                <button
                  onClick={() => setViewMode('kanban')}
                  className={`p-1.5 rounded ${viewMode === 'kanban' ? 'bg-red-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                  title="Kanban view"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </button>
                <button
                  onClick={() => setViewMode('card')}
                  className={`p-1.5 rounded ${viewMode === 'card' ? 'bg-red-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                  title="Card view"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </button>
              </div>
              <button className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span className="text-sm">Import</span>
              </button>
              <button className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-sm">Customise</span>
              </button>
              <button className="text-gray-600 hover:text-gray-800">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Leads Content - Table/Kanban/Card View */}
          {viewMode === 'table' && (
            <div className="bg-white rounded-[8px] border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <div className="flex items-center space-x-1">
                        <span>Name/Vehicle</span>
                        <div className="flex flex-col">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                          </svg>
                          <svg className="w-3 h-3 -mt-1" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </div>
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Lead stage
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Lead Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Source
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Assigned To
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Contacted
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Mobile
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                  {filteredLeads.map((lead) => (
                    <tr 
                      key={lead.id} 
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => router.push(`/leads/${lead.id}`)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 font-semibold">
                            {lead.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900">{lead.name}</div>
                            <div className="text-sm text-gray-500">Vehicle</div>
                          </div>
                        </div>
                  </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(lead.status)}`}>
                          {getStatusLabel(lead.status)}
                        </span>
                  </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          {lead.interest_level === 'hot' && (
                            <span className="text-red-500">🔥</span>
                          )}
                          {lead.interest_level === 'cold' && (
                            <span className="text-blue-500">❄️</span>
                          )}
                          <span className="text-sm text-gray-900 capitalize">{lead.interest_level || 'N/A'}</span>
                        </div>
                  </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          {sourceLogos[lead.source] && (
                            <Image
                              src={sourceLogos[lead.source]}
                              alt={sourceLabels[lead.source]}
                              width={20}
                              height={20}
                              className="rounded"
                            />
                          )}
                          <span className="text-sm text-gray-900">{sourceLabels[lead.source] || lead.source}</span>
                        </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                        {lead.assigned_user ? (
                          <div className="flex items-center space-x-2">
                            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-semibold">
                              {lead.assigned_user.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="text-sm font-medium text-gray-900">{lead.assigned_user.name}</div>
                              <div className="text-xs text-gray-500">Sales Executive</div>
                            </div>
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-500">Unassigned</span>
                        )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {getTimeAgo(lead.first_contact_at || lead.updated_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          <span className="text-sm text-gray-900">{lead.phone.substring(0, 6)}...</span>
                        </div>
                  </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          <span className="text-sm text-gray-900">{lead.email ? `${lead.email.substring(0, 8)}...` : 'N/A'}</span>
                        </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
              </div>
            </div>
          )}

          {/* Kanban View */}
          {viewMode === 'kanban' && (
            <div className="bg-white rounded-[8px] border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto p-4">
                <div className="flex gap-4 min-w-max">
                  {['new', 'interested', 'negotiation', 'converted', 'lost'].map((stage) => {
                    const stageLeads = filteredLeads.filter((lead) => {
                      if (kanbanGroupBy === 'Lead Stage') {
                        return lead.status === stage || 
                          (stage === 'interested' && (lead.status === 'interested' || lead.status === 'quotation_shared'))
                      }
                      return false
                    })
                    const stageLabel = stage === 'new' ? 'New' : 
                                     stage === 'interested' ? 'In review' :
                                     stage === 'negotiation' ? 'Negotiation' :
                                     stage === 'converted' ? 'Approved' : 'Closed'
                    
                    return (
                      <div key={stage} className="flex-shrink-0 w-80">
                        <div className="bg-gray-50 rounded-lg p-3 mb-3">
                          <h3 className="font-semibold text-sm text-gray-700">{stageLabel} ({stageLeads.length})</h3>
                        </div>
                        <div className="space-y-3 max-h-[600px] overflow-y-auto">
                          {stageLeads.map((lead) => (
                            <div
                              key={lead.id}
                              onClick={() => router.push(`/leads/${lead.id}`)}
                              className="bg-white border border-gray-200 rounded-[8px] p-4 cursor-pointer hover:shadow-md transition-shadow"
                            >
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center space-x-2">
                                  <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 text-xs font-semibold">
                                    {lead.name.charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-gray-900">{lead.name}</p>
                                    <p className="text-xs text-gray-500">Vehicle</p>
                                  </div>
                                </div>
                                {lead.interest_level === 'hot' && <span className="text-red-500">🔥</span>}
                                {lead.interest_level === 'cold' && <span className="text-blue-500">❄️</span>}
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-500">Price</span>
                                  <span className="text-sm font-semibold text-gray-900">$0</span>
                                </div>
                                <div className="flex items-center space-x-2 text-xs text-gray-500">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                  <span>Last: {getTimeAgo(lead.first_contact_at || lead.updated_at)}</span>
                                </div>
                                <div className="flex items-center space-x-2 text-xs text-gray-500">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                  </svg>
                                  <span>{lead.phone.substring(0, 6)}...</span>
                                </div>
                                {lead.assigned_user && (
                                  <div className="flex items-center space-x-2 pt-2 border-t border-gray-100">
                                    <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-semibold">
                                      {lead.assigned_user.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium text-gray-900 truncate">{lead.assigned_user.name}</p>
                                      <p className="text-xs text-gray-500">Sales Executive</p>
                                    </div>
                                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Card View */}
          {viewMode === 'card' && (
            <div className="bg-white rounded-[8px] border border-gray-200 overflow-hidden">
              <div className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredLeads.map((lead) => (
                    <div
                      key={lead.id}
                      onClick={() => router.push(`/leads/${lead.id}`)}
                      className="bg-white border border-gray-200 rounded-[8px] p-4 cursor-pointer hover:shadow-lg transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 font-semibold">
                            {lead.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{lead.name}</p>
                            <p className="text-xs text-gray-500">Vehicle</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-1">
                          {lead.interest_level === 'hot' && <span className="text-red-500 text-lg">🔥</span>}
                          {lead.interest_level === 'cold' && <span className="text-blue-500 text-lg">❄️</span>}
                        </div>
                      </div>
                      <div className="space-y-2 mb-3">
                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(lead.status)}`}>
                          {getStatusLabel(lead.status)}
                        </span>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">Price</span>
                          <span className="text-sm font-semibold text-gray-900">$0</span>
                        </div>
                        <div className="flex items-center space-x-2 text-xs text-gray-500">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span>Last: {getTimeAgo(lead.first_contact_at || lead.updated_at)}</span>
                        </div>
                        <div className="flex items-center space-x-2 text-xs text-gray-500">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          <span>{lead.phone.substring(0, 6)}...</span>
                        </div>
                        <div className="flex items-center space-x-2 text-xs text-gray-500">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          <span>{lead.email ? `${lead.email.substring(0, 10)}...` : 'N/A'}</span>
                        </div>
                      </div>
                      {lead.assigned_user && (
                        <div className="flex items-center space-x-2 pt-3 border-t border-gray-100">
                          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-semibold">
                            {lead.assigned_user.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-900 truncate">{lead.assigned_user.name}</p>
                            <p className="text-xs text-gray-500">Sales Executive</p>
                          </div>
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Pagination - Show only for table view */}
          {viewMode === 'table' && (
            <div className="bg-white rounded-[8px] border border-gray-200 overflow-hidden mt-6">
              <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t border-gray-200">
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-700">Rows per page:</span>
                  <select
                    value={rowsPerPage}
                    onChange={(e) => {
                      setRowsPerPage(Number(e.target.value))
                      setCurrentPage(1)
                    }}
                    className="border border-gray-300 rounded-md px-2 py-1 text-sm"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
                <div className="flex items-center space-x-4">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    &lt;
                  </button>
                  <span className="text-sm text-gray-700">
                    {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    &gt;
                  </button>
                </div>
                <button className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors flex items-center space-x-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>Download Documentation</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
