import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { getFollowUps } from '@/backend/services/followup.service'
import { createServiceClient } from '@/lib/supabase/service'
import { SYSTEM_ROLES } from '@/shared/constants/roles'

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const userId = authResult.user.id
    const userRole = authResult.user.role.name
    const now = new Date().toISOString()
    
    // For tele-callers: Get their own follow-ups
    if (userRole === 'tele_caller') {
      // Get overdue follow-ups (scheduled before now, status pending)
      const overdueFollowUps = await getFollowUps({
        assignedTo: userId,
        status: 'pending',
        scheduledBefore: now,
      })

      // Get upcoming follow-ups (scheduled in next 24 hours, status pending)
      const tomorrow = new Date()
      tomorrow.setHours(tomorrow.getHours() + 24)
      const upcomingFollowUps = await getFollowUps({
        assignedTo: userId,
        status: 'pending',
        scheduledAfter: now,
        scheduledBefore: tomorrow.toISOString(),
      })

      // Filter out overdue from upcoming
      const upcoming = (upcomingFollowUps || []).filter(
        (upcoming) => !(overdueFollowUps || []).some((overdue) => overdue.id === upcoming.id)
      )

      return NextResponse.json({
        overdue: overdueFollowUps || [],
        upcoming: upcoming,
        totalPending: (overdueFollowUps?.length || 0) + (upcoming?.length || 0),
        adminNotifications: [],
      })
    }

    // For admins: Get all follow-ups pending for more than 1 day
    if (userRole === SYSTEM_ROLES.ADMIN || userRole === SYSTEM_ROLES.SUPER_ADMIN) {
      const oneDayAgo = new Date()
      oneDayAgo.setDate(oneDayAgo.getDate() - 1)
      
      const allPendingFollowUps = await getFollowUps({
        status: 'pending',
        scheduledBefore: now, // Only overdue ones
      })

      // Filter follow-ups that are more than 1 day overdue
      const adminNotifications = (allPendingFollowUps || []).filter((followUp) => {
        const scheduledDate = new Date(followUp.scheduled_at)
        return scheduledDate < oneDayAgo
      })

      return NextResponse.json({
        overdue: [],
        upcoming: [],
        totalPending: 0,
        adminNotifications: adminNotifications || [],
      })
    }

    return NextResponse.json({
      overdue: [],
      upcoming: [],
      totalPending: 0,
      adminNotifications: [],
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch follow-up notifications' },
      { status: 500 }
    )
  }
}
