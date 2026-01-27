'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuthContext } from './AuthProvider'
import { useFollowupNotifications } from './FollowupNotificationsProvider'

export default function FollowUpNotifications() {
  const { role } = useAuthContext()
  const { loading, data: notifications } = useFollowupNotifications()
  const [showNotifications, setShowNotifications] = useState(true)

  // Show for tele-callers and admins
  if (loading || !notifications) {
    return null
  }

  const userRole = role?.name ?? null
  const isTeleCaller = userRole === 'tele_caller'
  const isAdmin = userRole === 'admin' || userRole === 'super_admin'
  
  const overdueCount = notifications.overdue.length
  const upcomingCount = notifications.upcoming.length
  const adminNotificationCount = notifications.adminNotifications?.length || 0

  // Don't show if no notifications
  if (isTeleCaller && notifications.totalPending === 0) {
    return null
  }
  if (isAdmin && adminNotificationCount === 0) {
    return null
  }

  return (
    <div className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {showNotifications && (
          <div className="py-3">
            {/* Tele-caller notifications */}
            {isTeleCaller && (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {overdueCount > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800 animate-blink-badge">
                          ⚠️ {overdueCount} Overdue Follow-up{overdueCount > 1 ? 's' : ''}
                        </span>
                      </div>
                    )}
                    {upcomingCount > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                          📅 {upcomingCount} Upcoming Follow-up{upcomingCount > 1 ? 's' : ''} (Next 24h)
                        </span>
                      </div>
                    )}
                    <Link
                      href="/followups"
                      className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      View All →
                    </Link>
                  </div>
                  <button
                    onClick={() => setShowNotifications(false)}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <span className="sr-only">Dismiss</span>
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
                
                {/* Show first few overdue follow-ups */}
                {overdueCount > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-sm font-medium text-red-700">Overdue Follow-ups:</p>
                    <div className="space-y-1">
                      {notifications.overdue.slice(0, 3).map((followUp) => (
                        <div key={followUp.id} className="text-sm text-gray-700">
                          <Link
                            href={`/leads/${followUp.lead?.id}`}
                            className="text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            {followUp.lead?.name || 'Unknown Lead'}
                          </Link>
                          {' - '}
                          <span className="text-gray-600">
                            Scheduled: {new Date(followUp.scheduled_at).toLocaleString()}
                          </span>
                        </div>
                      ))}
                      {overdueCount > 3 && (
                        <p className="text-sm text-gray-500">
                          +{overdueCount - 3} more overdue follow-up{overdueCount - 3 > 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Admin notifications */}
            {isAdmin && adminNotificationCount > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-800">
                      ⚠️ {adminNotificationCount} Follow-up{adminNotificationCount > 1 ? 's' : ''} Pending for 1+ Day
                    </span>
                    <Link
                      href="/followups"
                      className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      View All →
                    </Link>
                  </div>
                  <button
                    onClick={() => setShowNotifications(false)}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <span className="sr-only">Dismiss</span>
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
                
                {/* Show first few admin notifications */}
                <div className="mt-3 space-y-2">
                  <p className="text-sm font-medium text-orange-700">Follow-ups Pending for 1+ Day:</p>
                  <div className="space-y-1">
                    {notifications.adminNotifications?.slice(0, 3).map((followUp) => (
                      <div key={followUp.id} className="text-sm text-gray-700">
                        <Link
                          href={`/leads/${followUp.lead?.id}`}
                          className="text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          {followUp.lead?.name || 'Unknown Lead'}
                        </Link>
                        {' - '}
                        <span className="text-gray-600">
                          Scheduled: {new Date(followUp.scheduled_at).toLocaleString()}
                        </span>
                        {' - '}
                        <span className="text-gray-500 text-xs">
                          {Math.floor((new Date().getTime() - new Date(followUp.scheduled_at).getTime()) / (1000 * 60 * 60 * 24))} day(s) overdue
                        </span>
                      </div>
                    ))}
                    {adminNotificationCount > 3 && (
                      <p className="text-sm text-gray-500">
                        +{adminNotificationCount - 3} more follow-up{adminNotificationCount - 3 > 1 ? 's' : ''} pending
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
