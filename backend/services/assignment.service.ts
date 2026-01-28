import { createServiceClient } from '@/lib/supabase/service'
import { Database } from '@/shared/types/database'

type LeadSource = 'meta' | 'manual' | 'form'

export interface SkillMatch {
  userId: string
  matchScore: number
  matchReasons: string[]
}

export interface AssignmentOptions {
  leadScore?: number
  priority?: 'high' | 'normal' | 'low'
  interestLevel?: 'hot' | 'warm' | 'cold'
}

/**
 * Get user performance metrics for assignment
 */
async function getUserPerformanceMetrics(userId: string): Promise<{
  conversionRate: number
  averageResponseTime: number
  activeLeadsCount: number
  totalLeads: number
  convertedLeads: number
}> {
  const supabase = createServiceClient()
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  // Get assigned leads in last 30 days
  const { data: leads } = await supabase
    .from('leads')
    .select('status, created_at, first_contact_at')
    .eq('assigned_to', userId)
    .gte('created_at', thirtyDaysAgo.toISOString())

  const totalLeads = leads?.length || 0
  const convertedLeads =
    leads?.filter((l) => ['converted', 'deal_won', 'fully_paid'].includes(l.status)).length || 0
  const conversionRate = totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0

  // Calculate average response time
  let totalResponseTime = 0
  let responseCount = 0
  if (leads) {
    for (const lead of leads) {
      if (lead.first_contact_at && lead.created_at) {
        const created = new Date(lead.created_at)
        const contacted = new Date(lead.first_contact_at)
        const minutes = (contacted.getTime() - created.getTime()) / (1000 * 60)
        if (minutes >= 0 && minutes < 1440) {
          // Only count reasonable response times (< 24 hours)
          totalResponseTime += minutes
          responseCount++
        }
      }
    }
  }
  const averageResponseTime = responseCount > 0 ? totalResponseTime / responseCount : 999

  // Get active leads count
  const { count: activeLeadsCount } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('assigned_to', userId)
    .not('status', 'in', '(lost,discarded,fully_paid)')

  return {
    conversionRate,
    averageResponseTime,
    activeLeadsCount: activeLeadsCount || 0,
    totalLeads,
    convertedLeads,
  }
}

/**
 * Find users matching lead skills/requirements
 */
async function findSkillBasedMatches(leadId: string): Promise<SkillMatch[]> {
  const supabase = createServiceClient()

  // Call database function to find matching users
  const { data, error } = await supabase.rpc('find_matching_users_for_lead', {
    p_lead_id: leadId,
  })

  if (error || !data) {
    console.error('Failed to find skill-based matches:', error)
    return []
  }

  return (data as any[]).map((match) => ({
    userId: match.user_id,
    matchScore: parseFloat(match.match_score) || 0,
    matchReasons: match.match_reasons || [],
  }))
}

/**
 * Get top performers for priority assignment
 */
async function getTopPerformers(
  leadSource: LeadSource,
  limit: number = 3
): Promise<Array<{ userId: string; performance: any }>> {
  const supabase = createServiceClient()

  // Get tele_caller role
  const { data: teleCallerRole } = await supabase
    .from('roles')
    .select('id')
    .eq('name', 'tele_caller')
    .single()

  if (!teleCallerRole) {
    return []
  }

  // Get all tele_callers
  const { data: users } = await supabase
    .from('users')
    .select('id')
    .eq('role_id', teleCallerRole.id)

  if (!users || users.length === 0) {
    return []
  }

  // Get performance metrics for each user
  const performances = await Promise.all(
    users.map(async (user) => {
      const metrics = await getUserPerformanceMetrics(user.id)
      return {
        userId: user.id,
        performance: metrics,
      }
    })
  )

  // Sort by performance score (conversion rate * 0.6 + (1/response time) * 0.4)
  const scored = performances.map((p) => {
    const responseScore = p.performance.averageResponseTime > 0
      ? Math.min(100, (60 / p.performance.averageResponseTime) * 100)
      : 0
    const performanceScore = p.performance.conversionRate * 0.6 + responseScore * 0.4
    return {
      ...p,
      performanceScore,
    }
  })

  return scored
    .sort((a, b) => b.performanceScore - a.performanceScore)
    .slice(0, limit)
}

export async function assignLeadRoundRobin(
  leadSource: LeadSource,
  options?: AssignmentOptions & { leadId?: string }
): Promise<string | null> {
  const supabase = createServiceClient()

  // Skill-based routing (if lead ID provided and lead has requirements)
  if (options?.leadId) {
    const skillMatches = await findSkillBasedMatches(options.leadId)
    if (skillMatches.length > 0) {
      // Sort by match score and active lead count
      const matchesWithLoad = await Promise.all(
        skillMatches.map(async (match) => {
          const metrics = await getUserPerformanceMetrics(match.userId)
          return {
            ...match,
            activeLeads: metrics.activeLeadsCount,
            performanceScore: metrics.conversionRate,
          }
        })
      )

      // Sort by match score (desc), then active leads (asc), then performance (desc)
      matchesWithLoad.sort((a, b) => {
        if (a.matchScore !== b.matchScore) {
          return b.matchScore - a.matchScore
        }
        if (a.activeLeads !== b.activeLeads) {
          return a.activeLeads - b.activeLeads
        }
        return b.performanceScore - a.performanceScore
      })

      const selectedUser = matchesWithLoad[0]
      if (selectedUser && selectedUser.matchScore >= 20) {
        // Only use skill-based if match score is significant
        await updateAssignmentRecord(selectedUser.userId, leadSource)
        return selectedUser.userId
      }
    }
  }

  // Priority-based assignment for high-scoring or hot leads
  const isHighPriority =
    (options?.leadScore && options.leadScore >= 80) ||
    options?.priority === 'high' ||
    options?.interestLevel === 'hot'

  if (isHighPriority) {
    // Assign to top performers
    const topPerformers = await getTopPerformers(leadSource, 3)
    if (topPerformers.length > 0) {
      // Get their active lead counts and assign to the one with least active leads
      const performersWithLoad = await Promise.all(
        topPerformers.map(async (p) => {
          const metrics = await getUserPerformanceMetrics(p.userId)
          return {
            userId: p.userId,
            activeLeads: metrics.activeLeadsCount,
            performanceScore: p.performanceScore,
          }
        })
      )

      // Sort by active leads (ascending), then by performance (descending)
      performersWithLoad.sort((a, b) => {
        if (a.activeLeads !== b.activeLeads) {
          return a.activeLeads - b.activeLeads
        }
        return b.performanceScore - a.performanceScore
      })

      const selectedUser = performersWithLoad[0]
      if (selectedUser) {
        // Update assignment record
        await updateAssignmentRecord(selectedUser.userId, leadSource)
        return selectedUser.userId
      }
    }
  }

  // Standard round-robin assignment for normal priority leads
  // Get only users with tele_caller role
  const { data: teleCallerRole, error: roleError } = await supabase
    .from('roles')
    .select('id')
    .eq('name', 'tele_caller')
    .single()

  if (roleError || !teleCallerRole) {
    console.error('Tele caller role not found:', roleError)
    return null
  }

  // Get all users with tele_caller role only
  const roleData = teleCallerRole as { id: string }
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id')
    .eq('role_id', roleData.id)

  if (usersError || !users || users.length === 0) {
    console.error('No tele_caller users found:', usersError)
    return null
  }

  const userIds = (users as { id: string }[]).map((u) => u.id)

  // Get or create assignment records for this source
  const { data: assignments, error: assignmentsError } = await supabase
    .from('assignments')
    .select('*')
    .eq('lead_source', leadSource)
    .in('user_id', userIds)

  if (assignmentsError) {
    throw new Error(`Failed to fetch assignments: ${assignmentsError.message}`)
  }

  // Create assignment records for users that don't have one
  const existingUserIds = new Set((assignments as any[])?.map((a: any) => a.user_id) || [])
  const missingUserIds = userIds.filter((id) => !existingUserIds.has(id))

  if (missingUserIds.length > 0) {
    const newAssignments = missingUserIds.map((userId) => ({
      user_id: userId,
      lead_source: leadSource,
      last_assigned_at: new Date(1970, 0, 1).toISOString(), // Very old date
      assignment_count: 0,
    }))

    await supabase.from('assignments').insert(newAssignments as any)
  }

  // Get all assignments for this source (including newly created ones)
  const { data: allAssignments, error: allAssignmentsError } = await supabase
    .from('assignments')
    .select('*')
    .eq('lead_source', leadSource)
    .in('user_id', userIds)
    .order('last_assigned_at', { ascending: true })
    .order('assignment_count', { ascending: true })
    .limit(1)

  if (allAssignmentsError || !allAssignments || allAssignments.length === 0) {
    return null
  }

  const selectedAssignment = (allAssignments as any[])[0]
  const selectedUserId = selectedAssignment.user_id

  // Update assignment record
  await supabase
    .from('assignments')
    // @ts-ignore - Supabase type inference issue with dynamic updates
    .update({
      last_assigned_at: new Date().toISOString(),
      assignment_count: (selectedAssignment.assignment_count || 0) + 1,
    })
    .eq('id', selectedAssignment.id)

  return selectedUserId
}

/**
 * Update assignment record for a user
 */
async function updateAssignmentRecord(userId: string, leadSource: LeadSource): Promise<void> {
  const supabase = createServiceClient()

  // Get current assignment record
  const { data: assignment } = await supabase
    .from('assignments')
    .select('*')
    .eq('user_id', userId)
    .eq('lead_source', leadSource)
    .single()

  if (assignment) {
    await supabase
      .from('assignments')
      .update({
        last_assigned_at: new Date().toISOString(),
        assignment_count: (assignment.assignment_count || 0) + 1,
      })
      .eq('id', assignment.id)
  } else {
    // Create new assignment record
    await supabase.from('assignments').insert({
      user_id: userId,
      lead_source: leadSource,
      last_assigned_at: new Date().toISOString(),
      assignment_count: 1,
    } as any)
  }
}
