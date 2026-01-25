'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import Layout from '@/components/Layout'

interface Lead {
  id: string
  lead_id: string
  name: string
  phone: string
  email: string | null
  source: string
  status: string
  assigned_user: {
    id: string
    name: string
    email: string
  } | null
  created_at: string
}

interface TeleCaller {
  id: string
  name: string
  email: string
}

export default function LeadsPage() {
  const router = useRouter()
  const [leads, setLeads] = useState<Lead[]>([])
  const [allLeads, setAllLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [teleCallers, setTeleCallers] = useState<TeleCaller[]>([])
  const [reassigningLeadId, setReassigningLeadId] = useState<string | null>(null)
  const [selectedTeleCaller, setSelectedTeleCaller] = useState<string>('')
  const [reassignLoading, setReassignLoading] = useState(false)
  
  // Bulk reassign state
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set())
  const [bulkReassignModalOpen, setBulkReassignModalOpen] = useState(false)
  const [bulkReassignTeleCaller, setBulkReassignTeleCaller] = useState<string>('')
  const [bulkReassignLoading, setBulkReassignLoading] = useState(false)
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  useEffect(() => {
    checkAuth()
    fetchLeads()
  }, [])

  async function checkAuth() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
      return
    }

    // Get user role
    const { data: userData } = await supabase
      .from('users')
      .select('role_id, roles!users_role_id_fkey(name)')
      .eq('id', user.id)
      .single()

    if (userData) {
      const roleName = Array.isArray(userData.roles) 
        ? userData.roles[0]?.name 
        : (userData.roles as any)?.name
      setUserRole(roleName)

      // If admin or super_admin, fetch tele_callers for reassignment
      if (roleName === 'admin' || roleName === 'super_admin') {
        fetchTeleCallers()
      }
    }
  }

  async function fetchTeleCallers() {
    try {
      const response = await fetch('/api/users/tele-callers')
      if (response.ok) {
        const data = await response.json()
        setTeleCallers(data.teleCallers || [])
      }
    } catch (error) {
      console.error('Failed to fetch tele-callers:', error)
    }
  }

  async function fetchLeads() {
    try {
      const response = await fetch('/api/leads')
      if (response.ok) {
        const data = await response.json()
        setAllLeads(data.leads || [])
      }
    } catch (error) {
      console.error('Failed to fetch leads:', error)
    } finally {
      setLoading(false)
    }
  }

  // Calculate pagination
  useEffect(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    setLeads(allLeads.slice(startIndex, endIndex))
  }, [allLeads, currentPage, itemsPerPage])

  // Reset to page 1 when items per page changes
  useEffect(() => {
    setCurrentPage(1)
  }, [itemsPerPage])

  // Clear selected leads when page changes
  useEffect(() => {
    setSelectedLeadIds(new Set())
  }, [currentPage])

  const totalPages = Math.ceil(allLeads.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = Math.min(startIndex + itemsPerPage, allLeads.length)

  // Handle individual lead selection
  const handleLeadSelect = (leadId: string) => {
    setSelectedLeadIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(leadId)) {
        newSet.delete(leadId)
      } else {
        newSet.add(leadId)
      }
      return newSet
    })
  }

  // Handle select all on current page
  const handleSelectAll = () => {
    if (selectedLeadIds.size === leads.length && leads.every(lead => selectedLeadIds.has(lead.id))) {
      // Deselect all
      setSelectedLeadIds(new Set())
    } else {
      // Select all on current page
      setSelectedLeadIds(new Set(leads.map(lead => lead.id)))
    }
  }

  // Handle bulk reassign
  async function handleBulkReassign() {
    if (selectedLeadIds.size === 0) {
      alert('Please select at least one lead to reassign')
      return
    }

    if (!bulkReassignTeleCaller || bulkReassignTeleCaller.trim() === '' || bulkReassignTeleCaller === 'undefined') {
      alert('Please select a tele-caller')
      return
    }

    // Validate UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(bulkReassignTeleCaller)) {
      alert('Invalid tele-caller selection. Please try again.')
      return
    }

    setBulkReassignLoading(true)
    try {
      const response = await fetch('/api/leads/bulk-reassign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lead_ids: Array.from(selectedLeadIds),
          assigned_to: bulkReassignTeleCaller.trim(),
        }),
      })

      const data = await response.json()

      if (response.ok) {
        // Refresh leads list
        await fetchLeads()
        setSelectedLeadIds(new Set())
        setBulkReassignModalOpen(false)
        setBulkReassignTeleCaller('')
        alert(`Successfully reassigned ${data.success} lead(s)${data.failed > 0 ? `. ${data.failed} failed.` : ''}`)
      } else {
        alert(data.error || 'Failed to bulk reassign leads')
      }
    } catch (error) {
      console.error('Failed to bulk reassign leads:', error)
      alert('Failed to bulk reassign leads')
    } finally {
      setBulkReassignLoading(false)
    }
  }

  async function handleReassign(leadId: string | null) {
    if (!leadId) {
      alert('Invalid lead ID')
      return
    }

    // Validate selectedTeleCaller is a valid UUID string
    if (!selectedTeleCaller || selectedTeleCaller.trim() === '' || selectedTeleCaller === 'undefined') {
      alert('Please select a tele-caller')
      return
    }

    // Additional validation: ensure it looks like a UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(selectedTeleCaller)) {
      alert('Invalid tele-caller selection. Please try again.')
      return
    }

    setReassignLoading(true)
    try {
      const response = await fetch(`/api/leads/${leadId}/reassign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assigned_to: selectedTeleCaller.trim(),
        }),
      })

      const data = await response.json()

      if (response.ok) {
        // Refresh leads list
        await fetchLeads()
        setReassigningLeadId(null)
        setSelectedTeleCaller('')
        alert('Lead reassigned successfully')
      } else {
        alert(data.error || 'Failed to reassign lead')
      }
    } catch (error) {
      console.error('Failed to reassign lead:', error)
      alert('Failed to reassign lead')
    } finally {
      setReassignLoading(false)
    }
  }

  const isAdmin = userRole === 'admin' || userRole === 'super_admin'

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
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Leads
            {userRole === 'tele_caller' && (
              <span className="text-sm font-normal text-gray-500 ml-2">
                (Your assigned leads only)
              </span>
            )}
          </h1>
          {isAdmin && (
            <div className="flex gap-3">
              <Link
                href="/leads/upload"
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
              >
                Upload Leads (CSV/Excel)
              </Link>
              <Link
                href="/leads/new"
                className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
              >
                Add New Lead
              </Link>
            </div>
          )}
        </div>

        {/* Pagination Controls - Top */}
        <div className="bg-white rounded-lg shadow mb-4 p-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">
              Show:
            </label>
            <select
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(Number(e.target.value))}
              className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span className="text-sm text-gray-600">
              Showing {allLeads.length > 0 ? startIndex + 1 : 0} to {endIndex} of {allLeads.length} leads
            </span>
            {isAdmin && selectedLeadIds.size > 0 && (
              <span className="text-sm text-indigo-600 font-medium">
                {selectedLeadIds.size} selected
              </span>
            )}
          </div>
          {isAdmin && selectedLeadIds.size > 0 && (
            <button
              onClick={() => setBulkReassignModalOpen(true)}
              className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 text-sm font-medium"
            >
              Bulk Reassign ({selectedLeadIds.size})
            </button>
          )}
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {isAdmin && (
                  <th className="px-6 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={leads.length > 0 && leads.every(lead => selectedLeadIds.has(lead.id))}
                      onChange={handleSelectAll}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assigned To</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="px-6 py-8 text-center text-sm text-gray-500">
                    No leads found
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr key={lead.id} className={selectedLeadIds.has(lead.id) ? 'bg-indigo-50' : ''}>
                    {isAdmin && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedLeadIds.has(lead.id)}
                          onChange={() => handleLeadSelect(lead.id)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {lead.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {lead.phone?.replace(/^(p|tel|phone|mobile):/i, '').trim() || lead.phone}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">
                      {lead.source}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 capitalize">
                        {lead.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {lead.assigned_user?.name || 'Unassigned'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(lead.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/leads/${lead.id}`}
                          className="text-indigo-600 hover:text-indigo-900"
                        >
                          View
                        </Link>
                        {isAdmin && (
                          <button
                            onClick={() => {
                              setSelectedTeleCaller('') // Reset selection when opening modal
                              setReassigningLeadId(lead.id)
                            }}
                            className="text-green-600 hover:text-green-900"
                          >
                            Reassign
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls - Bottom */}
        {totalPages > 1 && (
          <div className="bg-white rounded-lg shadow mt-4 p-4 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                  // Show first page, last page, current page, and pages around current
                  if (
                    page === 1 ||
                    page === totalPages ||
                    (page >= currentPage - 1 && page <= currentPage + 1)
                  ) {
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`px-3 py-2 text-sm font-medium rounded-md ${
                          currentPage === page
                            ? 'bg-indigo-600 text-white'
                            : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {page}
                      </button>
                    )
                  } else if (page === currentPage - 2 || page === currentPage + 2) {
                    return <span key={page} className="px-2 text-gray-500">...</span>
                  }
                  return null
                })}
              </div>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
            <div className="text-sm text-gray-600">
              Page {currentPage} of {totalPages}
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Single Reassign Modal */}
      {reassigningLeadId && isAdmin && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Reassign Lead</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Tele-caller
              </label>
              <select
                value={selectedTeleCaller}
                onChange={(e) => {
                  const value = e.target.value
                  // Ensure we're setting a valid value, not undefined
                  if (value && value !== 'undefined') {
                    setSelectedTeleCaller(value)
                  } else {
                    setSelectedTeleCaller('')
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Select a tele-caller...</option>
                {teleCallers.map((tc) => {
                  // Ensure tele-caller has a valid ID
                  if (!tc.id) {
                    console.warn('Tele-caller missing ID:', tc)
                    return null
                  }
                  return (
                    <option key={tc.id} value={tc.id}>
                      {tc.name} ({tc.email})
                    </option>
                  )
                })}
              </select>
              {teleCallers.length === 0 && (
                <p className="text-sm text-red-600 mt-2">No tele-callers available. Please add tele-callers first.</p>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setReassigningLeadId(null)
                  setSelectedTeleCaller('')
                }}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
                disabled={reassignLoading}
              >
                Cancel
              </button>
              <button
                onClick={() => handleReassign(reassigningLeadId)}
                disabled={reassignLoading || !selectedTeleCaller || selectedTeleCaller.trim() === '' || teleCallers.length === 0}
                className="px-4 py-2 text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {reassignLoading ? 'Reassigning...' : 'Reassign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Reassign Modal */}
      {bulkReassignModalOpen && isAdmin && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">
              Bulk Reassign Leads ({selectedLeadIds.size} selected)
            </h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Tele-caller
              </label>
              <select
                value={bulkReassignTeleCaller}
                onChange={(e) => {
                  const value = e.target.value
                  // Ensure we're setting a valid value, not undefined
                  if (value && value !== 'undefined') {
                    setBulkReassignTeleCaller(value)
                  } else {
                    setBulkReassignTeleCaller('')
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Select a tele-caller...</option>
                {teleCallers.map((tc) => {
                  // Ensure tele-caller has a valid ID
                  if (!tc.id) {
                    console.warn('Tele-caller missing ID:', tc)
                    return null
                  }
                  return (
                    <option key={tc.id} value={tc.id}>
                      {tc.name} ({tc.email})
                    </option>
                  )
                })}
              </select>
              {teleCallers.length === 0 && (
                <p className="text-sm text-red-600 mt-2">No tele-callers available. Please add tele-callers first.</p>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setBulkReassignModalOpen(false)
                  setBulkReassignTeleCaller('')
                }}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
                disabled={bulkReassignLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleBulkReassign}
                disabled={bulkReassignLoading || !bulkReassignTeleCaller || bulkReassignTeleCaller.trim() === '' || teleCallers.length === 0}
                className="px-4 py-2 text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {bulkReassignLoading ? 'Reassigning...' : `Reassign ${selectedLeadIds.size} Lead(s)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
