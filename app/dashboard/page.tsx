 'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'
import { useAuthContext } from '@/components/AuthProvider'

interface Analytics {
  leadsBySource: Record<string, number>
  leadsByStatus: Record<string, number>
  conversionRate: number
  repPerformance: Array<{
    user_id: string
    user_name: string
    total_leads: number
    converted_leads: number
    conversion_rate: number
  }>
  followUpCompliance: number
  slaBreaches: number
}

export default function DashboardPage() {
  const router = useRouter()
  const { isAuthenticated, role } = useAuthContext()
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [followUpAlerts, setFollowUpAlerts] = useState<{
    overdue: number
    upcoming: number
    adminNotifications?: number
  } | null>(null)

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    checkAuth()
    fetchAnalytics()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])

  async function checkAuth() {
    // Use auth context role name instead of duplicating Supabase queries.
    const roleName = role?.name ?? null
    setUserRole(roleName)

    if (roleName === 'tele_caller' || roleName === 'admin' || roleName === 'super_admin') {
      fetchFollowUpAlerts()
      // Refresh alerts every 5 minutes, matching previous behaviour.
      const interval = setInterval(fetchFollowUpAlerts, 5 * 60 * 1000)
      return () => clearInterval(interval)
    }
  }

  async function fetchAnalytics() {
    try {
      const response = await fetch('/api/analytics')
      if (response.ok) {
        const data = await response.json()
        setAnalytics(data)
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  const totalLeads = useMemo(() => {
    if (!analytics) return 0
    return Object.values(analytics.leadsByStatus).reduce((a, b) => a + b, 0)
  }, [analytics])

  async function fetchFollowUpAlerts() {
    try {
      const response = await fetch('/api/followups/notifications')
      if (response.ok) {
        const data = await response.json()
        setFollowUpAlerts({
          overdue: data.overdue?.length || 0,
          upcoming: data.upcoming?.length || 0,
          adminNotifications: data.adminNotifications?.length || 0,
        })
      }
    } catch (error) {
      console.error('Failed to fetch follow-up alerts:', error)
    }
  }

  return (
    <Layout>
      <div className="p-4 md:p-6 lg:p-8 w-full">
        <div className="w-full">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">Dashboard</h1>

          {loading && (
            // Keep shell visible and show a lightweight skeleton instead of a blank screen.
            <div className="mb-8 space-y-4">
              <div className="h-4 w-40 rounded bg-gray-200 animate-pulse" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="bg-white rounded-lg shadow p-6 space-y-3">
                    <div className="h-3 w-24 rounded bg-gray-200 animate-pulse" />
                    <div className="h-6 w-16 rounded bg-gray-200 animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Follow-up Alerts for Tele-callers */}
          {userRole === 'tele_caller' && followUpAlerts && (followUpAlerts.overdue > 0 || followUpAlerts.upcoming > 0) && (
            <div className="mb-6">
              {followUpAlerts.overdue > 0 && (
                <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">
                        ⚠️ You have {followUpAlerts.overdue} overdue follow-up{followUpAlerts.overdue > 1 ? 's' : ''}!
                      </h3>
                      <div className="mt-2 text-sm text-red-700">
                        <p>Please complete your overdue follow-ups as soon as possible.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {followUpAlerts.upcoming > 0 && (
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-yellow-800">
                        📅 You have {followUpAlerts.upcoming} upcoming follow-up{followUpAlerts.upcoming > 1 ? 's' : ''} in the next 24 hours
                      </h3>
                      <div className="mt-2 text-sm text-yellow-700">
                        <p>Make sure you're prepared for these scheduled calls.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Admin Follow-up Alerts */}
          {(userRole === 'admin' || userRole === 'super_admin') && followUpAlerts && followUpAlerts.adminNotifications && followUpAlerts.adminNotifications > 0 && (
            <div className="mb-6">
              <div className="bg-orange-50 border-l-4 border-orange-400 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-orange-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-orange-800">
                      ⚠️ {followUpAlerts.adminNotifications} Follow-up{followUpAlerts.adminNotifications > 1 ? 's' : ''} Pending for 1+ Day
                    </h3>
                    <div className="mt-2 text-sm text-orange-700">
                      <p>There are follow-ups that have been pending for more than 1 day and need attention.</p>
                    </div>
                    <div className="mt-3">
                      <Link
                        href="/followups"
                        className="text-sm font-medium text-orange-800 hover:text-orange-900 underline"
                      >
                        View All Follow-ups →
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500">Total Leads</h3>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {analytics ? totalLeads : 0}
              </p>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500">Conversion Rate</h3>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {analytics ? `${analytics.conversionRate.toFixed(1)}%` : '0%'}
              </p>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500">Follow-up Compliance</h3>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {analytics ? `${analytics.followUpCompliance.toFixed(1)}%` : '0%'}
              </p>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500">SLA Breaches</h3>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {analytics ? analytics.slaBreaches : 0}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Leads by Source</h2>
              <div className="space-y-2">
                {analytics && Object.entries(analytics.leadsBySource).map(([source, count]) => (
                  <div key={source} className="flex justify-between">
                    <span className="text-gray-600 capitalize">{source}</span>
                    <span className="font-semibold">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Leads by Status</h2>
              <div className="space-y-2">
                {analytics && Object.entries(analytics.leadsByStatus).map(([status, count]) => (
                  <div key={status} className="flex justify-between">
                    <span className="text-gray-600 capitalize">{status.replace('_', ' ')}</span>
                    <span className="font-semibold">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {analytics && analytics.repPerformance.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6 mt-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Rep Performance</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rep</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Leads</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Converted</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Conversion Rate</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {analytics.repPerformance.map((rep) => (
                      <tr key={rep.user_id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {rep.user_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {rep.total_leads}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {rep.converted_leads}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {rep.conversion_rate.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
