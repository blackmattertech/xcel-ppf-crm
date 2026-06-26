'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { invalidateApiCache } from '@/lib/api-client'

export interface LeadAutomationEnrollmentSnapshot {
  id: string
  flow_id: string
  status: string
  started_at: string
  cycle_number: number
  flow?: { id: string; name: string; cycle_days: number }
}

interface LeadInterestsSyncContextValue {
  enrollmentsVersion: number
  latestEnrollments: LeadAutomationEnrollmentSnapshot[] | null
  pushEnrollments: (enrollments: LeadAutomationEnrollmentSnapshot[]) => void
  bumpEnrollments: () => void
  bumpBuckets: () => void
  bucketsVersion: number
}

const LeadInterestsSyncContext = createContext<LeadInterestsSyncContextValue | null>(null)

export function invalidateLeadInterestsCache(leadId: string): void {
  invalidateApiCache(`GET:/api/leads/${leadId}/buckets`)
  invalidateApiCache(`/api/automation/whatsapp/enrollments?leadId=${leadId}`)
}

interface LeadInterestsSyncProviderProps {
  leadId: string
  /** When false, pause background refresh (embedded dialog closed). */
  active?: boolean
  children: ReactNode
}

export function LeadInterestsSyncProvider({
  leadId,
  active = true,
  children,
}: LeadInterestsSyncProviderProps) {
  const [enrollmentsVersion, setEnrollmentsVersion] = useState(0)
  const [bucketsVersion, setBucketsVersion] = useState(0)
  const [latestEnrollments, setLatestEnrollments] = useState<LeadAutomationEnrollmentSnapshot[] | null>(
    null
  )
  const leadIdRef = useRef(leadId)

  useEffect(() => {
    leadIdRef.current = leadId
    setLatestEnrollments(null)
    setEnrollmentsVersion((v) => v + 1)
    setBucketsVersion((v) => v + 1)
  }, [leadId])

  const pushEnrollments = useCallback((enrollments: LeadAutomationEnrollmentSnapshot[]) => {
    setLatestEnrollments(enrollments)
    setEnrollmentsVersion((v) => v + 1)
    invalidateLeadInterestsCache(leadIdRef.current)
  }, [])

  const bumpEnrollments = useCallback(() => {
    setLatestEnrollments(null)
    setEnrollmentsVersion((v) => v + 1)
    invalidateLeadInterestsCache(leadIdRef.current)
  }, [])

  const bumpBuckets = useCallback(() => {
    setBucketsVersion((v) => v + 1)
    invalidateLeadInterestsCache(leadIdRef.current)
  }, [])

  useEffect(() => {
    if (!active) return
    bumpEnrollments()
    const intervalId = window.setInterval(() => {
      bumpEnrollments()
    }, 5000)
    return () => window.clearInterval(intervalId)
  }, [active, bumpEnrollments])

  const value = useMemo(
    () => ({
      enrollmentsVersion,
      latestEnrollments,
      pushEnrollments,
      bumpEnrollments,
      bumpBuckets,
      bucketsVersion,
    }),
    [
      enrollmentsVersion,
      latestEnrollments,
      pushEnrollments,
      bumpEnrollments,
      bumpBuckets,
      bucketsVersion,
    ]
  )

  return (
    <LeadInterestsSyncContext.Provider value={value}>{children}</LeadInterestsSyncContext.Provider>
  )
}

export function useLeadInterestsSync(): LeadInterestsSyncContextValue | null {
  return useContext(LeadInterestsSyncContext)
}
