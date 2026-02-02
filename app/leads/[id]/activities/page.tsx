'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Layout from '@/components/Layout'
import { ArrowLeft, Phone, Mail, MessageSquare, Calendar, FileText, User, Clock } from 'lucide-react'

interface Activity {
  id: string
  activity_type: string
  activity_subtype?: string
  title: string
  description?: string
  performed_at: string
  performed_by_user?: {
    id: string
    name: string
    email: string
  }
  metadata?: Record<string, any>
}

export default function LeadActivitiesPage() {
  const params = useParams()
  const router = useRouter()
  const { user, isLoading: authLoading, isAuthenticated } = useAuth()
  const leadId = params.id as string
  const [activities, setActivities] = useState<Activity[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  const userRole = user?.role || null
  const userPermissions = user?.permissions || []
  const hasReadPermission = userPermissions.includes('leads.read')
  const hasManagePermission = userPermissions.includes('leads.manage')

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
      return
    }

    // Check permissions - users need leads.read or leads.manage to view activities
    if (!authLoading && user && !hasReadPermission && !hasManagePermission) {
      router.push('/leads')
    }
  }, [authLoading, isAuthenticated, user, userPermissions, hasReadPermission, hasManagePermission, router])

  useEffect(() => {
    if (isAuthenticated && (hasReadPermission || hasManagePermission)) {
      fetchActivities()
      fetchSummary()
    }
  }, [leadId, filter, isAuthenticated, hasReadPermission, hasManagePermission])

  if (!authLoading && !isAuthenticated) {
    return null
  }

  if (!authLoading && user && !hasReadPermission && !hasManagePermission) {
    return null
  }

  async function fetchActivities() {
    setLoading(true)
    try {
      const url = `/api/leads/${leadId}/activities${filter !== 'all' ? `?activityType=${filter}` : ''}`
      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        console.log('Activities data:', data) // Debug log
        setActivities(data.activities || [])
      } else {
        const errorData = await response.json()
        console.error('Failed to fetch activities:', errorData)
      }
    } catch (error) {
      console.error('Failed to fetch activities:', error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchSummary() {
    try {
      const response = await fetch(`/api/leads/${leadId}/activities?summary=true`)
      if (response.ok) {
        const data = await response.json()
        setSummary(data.summary)
      }
    } catch (error) {
      console.error('Failed to fetch summary:', error)
    }
  }

  function getActivityIcon(type: string) {
    switch (type) {
      case 'call':
        return <Phone className="w-5 h-5" />
      case 'email':
        return <Mail className="w-5 h-5" />
      case 'sms':
      case 'whatsapp':
        return <MessageSquare className="w-5 h-5" />
      case 'meeting':
        return <Calendar className="w-5 h-5" />
      case 'note':
        return <FileText className="w-5 h-5" />
      case 'status_change':
        return <User className="w-5 h-5" />
      default:
        return <Clock className="w-5 h-5" />
    }
  }

  function getActivityColor(type: string) {
    switch (type) {
      case 'call':
        return 'bg-blue-100 text-blue-600'
      case 'email':
        return 'bg-green-100 text-green-600'
      case 'sms':
      case 'whatsapp':
        return 'bg-purple-100 text-purple-600'
      case 'meeting':
        return 'bg-orange-100 text-orange-600'
      case 'note':
        return 'bg-gray-100 text-gray-600'
      case 'status_change':
        return 'bg-indigo-100 text-indigo-600'
      case 'assignment':
        return 'bg-yellow-100 text-yellow-600'
      case 'followup_created':
      case 'followup_completed':
        return 'bg-pink-100 text-pink-600'
      case 'quotation_sent':
      case 'quotation_viewed':
      case 'quotation_accepted':
        return 'bg-teal-100 text-teal-600'
      default:
        return 'bg-gray-100 text-gray-600'
    }
  }

  function getTimeAgo(dateString: string): string {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`
    return date.toLocaleDateString()
  }

  if (loading) {
    return (
      <Layout>
        <div className="p-6">
          <div className="text-center text-gray-600">Loading activities...</div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push(`/leads/${leadId}`)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl font-bold text-gray-900">Activity Timeline</h1>
          </div>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="text-2xl font-bold text-gray-900">{summary.total}</div>
              <div className="text-sm text-gray-500">Total Activities</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="text-2xl font-bold text-gray-900">{summary.byType.call || 0}</div>
              <div className="text-sm text-gray-500">Calls</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="text-2xl font-bold text-gray-900">{summary.byType.email || 0}</div>
              <div className="text-sm text-gray-500">Emails</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="text-2xl font-bold text-gray-900">
                {summary.lastActivity ? new Date(summary.lastActivity).toLocaleDateString() : 'N/A'}
              </div>
              <div className="text-sm text-gray-500">Last Activity</div>
            </div>
          </div>
        )}

        {/* Filter */}
        <div className="mb-4 flex gap-2">
          {['all', 'call', 'email', 'sms', 'whatsapp', 'note', 'status_change'].map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === type
                  ? 'bg-[#ed1b24] text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* Activities Timeline */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading activities...</div>
          ) : activities.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p className="mb-2">No activities found</p>
              <p className="text-sm text-gray-400">
                {filter !== 'all' ? `No ${filter} activities for this lead.` : 'This lead has no recorded activities yet.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {activities.map((activity, idx) => {
                const performedAt = new Date(activity.performed_at)
                const timeAgo = getTimeAgo(activity.performed_at)
                
                return (
                  <div key={activity.id || idx} className="p-6 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start gap-4">
                      <div className={`p-2 rounded-lg flex-shrink-0 ${getActivityColor(activity.activity_type)}`}>
                        {getActivityIcon(activity.activity_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-2 gap-4">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-base font-semibold text-gray-900">{activity.title || 'Activity'}</h3>
                            {activity.description && (
                              <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{activity.description}</p>
                            )}
                            {activity.activity_subtype && (
                              <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium text-gray-600 bg-gray-100 rounded">
                                {activity.activity_subtype.replace(/_/g, ' ')}
                              </span>
                            )}
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <div className="text-xs text-gray-500 whitespace-nowrap">
                              {timeAgo}
                            </div>
                            <div className="text-xs text-gray-400 whitespace-nowrap">
                              {performedAt.toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        {activity.performed_by_user && (
                          <div className="flex items-center gap-2 text-sm text-gray-500 mt-2">
                            <User className="w-4 h-4 flex-shrink-0" />
                            <span>{activity.performed_by_user.name}</span>
                            {activity.performed_by_user.email && (
                              <span className="text-gray-400">({activity.performed_by_user.email})</span>
                            )}
                          </div>
                        )}
                        {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                          <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                            <div className="text-xs font-medium text-gray-700 mb-2">Additional Details:</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-600">
                              {Object.entries(activity.metadata).map(([key, value]) => {
                                const displayKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
                                let displayValue: string
                                
                                if (value === null || value === undefined) {
                                  displayValue = '-'
                                } else if (typeof value === 'object') {
                                  displayValue = JSON.stringify(value, null, 2)
                                } else {
                                  displayValue = String(value)
                                }
                                
                                return (
                                  <div key={key} className="flex gap-2">
                                    <span className="font-medium text-gray-700 min-w-[100px]">{displayKey}:</span>
                                    <span className="text-gray-600 break-words">{displayValue}</span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
