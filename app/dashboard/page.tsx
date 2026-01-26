'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useAnalytics } from '@/hooks/useAnalytics'
import { useFollowUpNotifications } from '@/hooks/useFollowUpNotifications'
import Layout from '@/components/Layout'

export default function DashboardPage() {
  const router = useRouter()
  const { user, isLoading: authLoading, isAuthenticated } = useAuth()
  const { data: analytics, isLoading: analyticsLoading } = useAnalytics()
  
  const userRole = user?.role || null
  const isTeleCaller = userRole === 'tele_caller'
  const isAdmin = userRole === 'admin' || userRole === 'super_admin'
  
  // Only fetch follow-up notifications if needed
  const { data: followUpData } = useFollowUpNotifications(isTeleCaller || isAdmin)

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated, router])

  // Don't show anything if not authenticated
  if (!authLoading && !isAuthenticated) {
    return null
  }

  const followUpAlerts = followUpData ? {
    overdue: followUpData.overdue?.length || 0,
    upcoming: followUpData.upcoming?.length || 0,
    adminNotifications: followUpData.adminNotifications?.length || 0,
  } : null

  return (
    <Layout>
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Dashboard</h1>

          {/* Follow-up Alerts for Tele-callers */}
          {isTeleCaller && followUpAlerts && (followUpAlerts.overdue > 0 || followUpAlerts.upcoming > 0) && (
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
          {isAdmin && followUpAlerts && followUpAlerts.adminNotifications && followUpAlerts.adminNotifications > 0 && (
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

          {/* Summary Cards - Show skeleton while loading */}
          {analyticsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {[1, 2, 3, 4].map((i) => (
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
                {analytics ? Object.values(analytics.leadsByStatus).reduce((a, b) => a + b, 0) : 0}
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
          )}

          {/* Charts - Show skeleton while loading */}
          {analyticsLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {[1, 2].map((i) => (
                <div key={i} className="bg-white rounded-lg shadow p-6 animate-pulse">
                  <div className="h-6 bg-gray-200 rounded w-32 mb-4"></div>
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map((j) => (
                      <div key={j} className="flex justify-between">
                        <div className="h-4 bg-gray-200 rounded w-24"></div>
                        <div className="h-4 bg-gray-200 rounded w-8"></div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
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
          )}

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
