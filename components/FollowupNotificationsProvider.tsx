'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useAuthContext } from './AuthProvider'

type FollowUp = {
  id: string
  scheduled_at: string
  notes: string | null
  lead: {
    id: string
    name: string
    phone: string
  } | null
}

type FollowUpNotifications = {
  overdue: FollowUp[]
  upcoming: FollowUp[]
  totalPending: number
  adminNotifications?: FollowUp[]
  adminNotificationsCount?: number
}

type FollowupContextValue = {
  loading: boolean
  data: FollowUpNotifications | null
}

const FollowupContext = createContext<FollowupContextValue | undefined>(undefined)

/**
 * Shared follow-up notifications provider.
 *
 * This centralises the `/api/followups/notifications` polling so that Sidebar,
 * banner notifications, and popup alerts consume the same data without
 * duplicating network calls or timers.
 *
 * Polls every 30 seconds for on-time follow-up alerts without delay.
 */
export function FollowupNotificationsProvider({ children }: { children: React.ReactNode }) {
  const { role, isAuthenticated } = useAuthContext()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<FollowUpNotifications | null>(null)

  useEffect(() => {
    const isTeleCaller = role?.name === 'tele_caller'
    const isAdmin = role?.name === 'admin' || role?.name === 'super_admin'

    if (!isAuthenticated || (!isTeleCaller && !isAdmin)) {
      return
    }

    let isMounted = true
    let intervalId: number | undefined

    async function load() {
      try {
        if (!isMounted) return
        setLoading(true)
        const response = await fetch('/api/followups/notifications')
        if (!isMounted) return
        if (response.ok) {
          const json = await response.json()
          const adminCount =
            typeof json.adminNotificationsCount === 'number'
              ? json.adminNotificationsCount
              : json.adminNotifications?.length ?? 0

          setData({
            overdue: json.overdue ?? [],
            upcoming: json.upcoming ?? [],
            totalPending: json.totalPending ?? 0,
            adminNotifications: json.adminNotifications ?? [],
            adminNotificationsCount: adminCount,
          })
        }
      } catch (e) {
        console.error('Failed to fetch follow-up notifications:', e)
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    // Initial load and 30-second polling for on-time follow-up alerts
    load()
    intervalId = window.setInterval(load, 30 * 1000)

    return () => {
      isMounted = false
      if (intervalId) {
        window.clearInterval(intervalId)
      }
    }
  }, [role, isAuthenticated])

  const value = useMemo<FollowupContextValue>(
    () => ({
      loading,
      data,
    }),
    [loading, data]
  )

  return <FollowupContext.Provider value={value}>{children}</FollowupContext.Provider>
}

export function useFollowupNotifications(): FollowupContextValue {
  const ctx = useContext(FollowupContext)
  if (!ctx) {
    throw new Error('useFollowupNotifications must be used within FollowupNotificationsProvider')
  }
  return ctx
}

