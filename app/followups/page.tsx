'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useFollowUps } from '@/hooks/useFollowUps'
import { useLeads } from '@/hooks/useLeads'
import Layout from '@/components/Layout'

export default function FollowUpsPage() {
  const router = useRouter()
  const { user, isLoading: authLoading, isAuthenticated } = useAuth()
  const { data: allFollowUps = [], isLoading: followUpsLoading } = useFollowUps()
  const { data: allLeads = [] } = useLeads()
  const [filter, setFilter] = useState<'all' | 'overdue' | 'upcoming' | 'pending'>('all')

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated, router])

  if (!authLoading && !isAuthenticated) {
    return null
  }

  // Filter follow-ups based on selected filter
  const followUps = useMemo(() => {
    const now = new Date()
    let filtered = [...allFollowUps]

    if (filter === 'overdue') {
      filtered = filtered.filter(
        (fu) => fu.status === 'pending' && new Date(fu.scheduled_at) < now
      )
    } else if (filter === 'upcoming') {
      const tomorrow = new Date()
      tomorrow.setHours(tomorrow.getHours() + 24)
      filtered = filtered.filter(
        (fu) => fu.status === 'pending' && new Date(fu.scheduled_at) >= now && new Date(fu.scheduled_at) <= tomorrow
      )
    } else if (filter === 'pending') {
      filtered = filtered.filter((fu) => fu.status === 'pending')
    }

    return filtered
  }, [allFollowUps, filter])

  const now = new Date()
  const overdueFollowUps = allFollowUps.filter(
    (fu) => fu.status === 'pending' && new Date(fu.scheduled_at) < now
  )
  const upcomingFollowUps = allFollowUps.filter(
    (fu) => fu.status === 'pending' && new Date(fu.scheduled_at) >= now
  )
  const pendingFollowUps = allFollowUps.filter((fu) => fu.status === 'pending')

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
        // Invalidate and refetch follow-ups
        window.location.reload() // Simple refresh for now
      } else {
        const errorData = await response.json()
        alert(errorData.error || 'Failed to complete follow-up')
      }
    } catch (error) {
      console.error('Failed to complete follow-up:', error)
      alert('Failed to complete follow-up')
    }
  }

  const loading = followUpsLoading

  return (
    <Layout>
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Follow-ups</h1>

          {/* Stats Cards - Show skeleton while loading */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {[1, 2].map((i) => (
                <div key={i} className="bg-white rounded-lg shadow p-6 animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded w-16"></div>
                </div>
              ))}
            </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500">Total Leads</h3>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {allLeads.length}
              </p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500">Total Follow-ups</h3>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {allFollowUps.length}
              </p>
            </div>
          </div>
          )}

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
                All ({allFollowUps.length})
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
                Pending ({pendingFollowUps.length})
              </button>
            </div>
          </div>

          {/* Follow-ups List - Show skeleton while loading */}
          {loading ? (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="animate-pulse p-6 space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 bg-gray-200 rounded"></div>
                ))}
              </div>
            </div>
          ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {followUps.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-gray-500">
                No follow-ups found
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {followUps.map((followUp: any) => {
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
          )}
        </div>
      </div>
    </Layout>
  )
}
