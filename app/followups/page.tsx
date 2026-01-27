'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import Layout from '@/components/Layout'

interface FollowUp {
  id: string
  scheduled_at: string
  completed_at: string | null
  status: string
  notes: string | null
  lead: {
    id: string
    name: string
    phone: string
    status: string
  } | null
}

export default function FollowUpsPage() {
  const router = useRouter()
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'overdue' | 'upcoming' | 'pending'>('all')
  const [totalLeads, setTotalLeads] = useState(0)

  useEffect(() => {
    checkAuth()
    fetchFollowUps()
    fetchTotalLeads()
  }, [filter])

  async function fetchTotalLeads() {
    try {
      const response = await fetch('/api/leads')
      if (response.ok) {
        const data = await response.json()
        setTotalLeads(data.leads?.length || 0)
      }
    } catch (error) {
      console.error('Failed to fetch total leads:', error)
    }
  }

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
      const userDataTyped = userData as any
      const roleName = Array.isArray(userDataTyped.roles) 
        ? userDataTyped.roles[0]?.name 
        : userDataTyped.roles?.name
      setUserRole(roleName)
    }
  }

  async function fetchFollowUps() {
    try {
      const now = new Date().toISOString()
      let url = '/api/followups?'
      
      if (filter === 'overdue') {
        url += `status=pending&scheduledBefore=${now}`
      } else if (filter === 'upcoming') {
        const tomorrow = new Date()
        tomorrow.setHours(tomorrow.getHours() + 24)
        url += `status=pending&scheduledAfter=${now}&scheduledBefore=${tomorrow.toISOString()}`
      } else if (filter === 'pending') {
        url += 'status=pending'
      }

      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        setFollowUps(data.followUps || [])
      }
    } catch (error) {
      console.error('Failed to fetch follow-ups:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleCompleteFollowUp(followUpId: string) {
    try {
      const response = await fetch(`/api/followups/${followUpId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: 'Follow-up completed',
        }),
      })

      if (response.ok) {
        await fetchFollowUps()
        alert('Follow-up marked as completed')
      } else {
        const errorData = await response.json()
        alert(errorData.error || 'Failed to complete follow-up')
      }
    } catch (error) {
      console.error('Failed to complete follow-up:', error)
      alert('Failed to complete follow-up')
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-lg">Loading...</div>
        </div>
      </Layout>
    )
  }

  const now = new Date()
  const overdueFollowUps = followUps.filter(
    (fu) => fu.status === 'pending' && new Date(fu.scheduled_at) < now
  )
  const upcomingFollowUps = followUps.filter(
    (fu) => fu.status === 'pending' && new Date(fu.scheduled_at) >= now
  )
  const completedFollowUps = followUps.filter((fu) => fu.status === 'done')

  return (
    <Layout>
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Follow-ups</h1>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500">Total Leads</h3>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {totalLeads}
              </p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500">Total Follow-ups</h3>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {followUps.length}
              </p>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="bg-white rounded-lg shadow mb-6 p-4">
            <div className="flex gap-4">
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded-md text-sm font-medium ${
                  filter === 'all'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All ({followUps.length})
              </button>
              <button
                onClick={() => setFilter('overdue')}
                className={`px-4 py-2 rounded-md text-sm font-medium ${
                  filter === 'overdue'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Overdue ({overdueFollowUps.length})
              </button>
              <button
                onClick={() => setFilter('upcoming')}
                className={`px-4 py-2 rounded-md text-sm font-medium ${
                  filter === 'upcoming'
                    ? 'bg-yellow-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Upcoming ({upcomingFollowUps.length})
              </button>
              <button
                onClick={() => setFilter('pending')}
                className={`px-4 py-2 rounded-md text-sm font-medium ${
                  filter === 'pending'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Pending ({followUps.filter((fu) => fu.status === 'pending').length})
              </button>
            </div>
          </div>

          {/* Follow-ups List */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {followUps.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-gray-500">
                No follow-ups found
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {followUps.map((followUp) => {
                  const scheduledDate = new Date(followUp.scheduled_at)
                  const isOverdue = followUp.status === 'pending' && scheduledDate < now
                  const isUpcoming = followUp.status === 'pending' && scheduledDate >= now

                  return (
                    <div
                      key={followUp.id}
                      className={`p-6 ${
                        isOverdue
                          ? 'bg-red-50 border-l-4 border-red-500'
                          : isUpcoming
                          ? 'bg-yellow-50 border-l-4 border-yellow-500'
                          : 'bg-white'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <Link
                              href={`/leads/${followUp.lead?.id}`}
                              className="text-lg font-semibold text-gray-900 hover:text-indigo-600"
                            >
                              {followUp.lead?.name || 'Unknown Lead'}
                            </Link>
                            <span className={`px-2 py-1 text-xs font-semibold rounded ${
                              followUp.status === 'done'
                                ? 'bg-green-100 text-green-800'
                                : isOverdue
                                ? 'bg-red-100 text-red-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {followUp.status === 'done'
                                ? '✅ Completed'
                                : isOverdue
                                ? '⚠️ Overdue'
                                : '📅 Upcoming'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mb-1">
                            <span className="font-medium">Scheduled:</span>{' '}
                            {scheduledDate.toLocaleString()}
                          </p>
                          {followUp.completed_at && (
                            <p className="text-sm text-gray-600 mb-1">
                              <span className="font-medium">Completed:</span>{' '}
                              {new Date(followUp.completed_at).toLocaleString()}
                            </p>
                          )}
                          {followUp.lead?.phone && (
                            <p className="text-sm text-gray-600 mb-1">
                              <span className="font-medium">Phone:</span>{' '}
                              {followUp.lead.phone.replace(/^(p|tel|phone|mobile):/i, '').trim()}
                            </p>
                          )}
                          {followUp.notes && (
                            <p className="text-sm text-gray-700 mt-2 bg-gray-50 p-2 rounded">
                              {followUp.notes}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2 ml-4">
                          {followUp.status === 'pending' && (
                            <button
                              onClick={() => handleCompleteFollowUp(followUp.id)}
                              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
                            >
                              Mark Done
                            </button>
                          )}
                          <Link
                            href={`/leads/${followUp.lead?.id}`}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm"
                          >
                            View Lead
                          </Link>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
