import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { updateLead } from '@/backend/services/lead.service'
import { PERMISSIONS } from '@/shared/constants/permissions'
import { z } from 'zod'
import { SYSTEM_ROLES } from '@/shared/constants/roles'
import { createServiceClient } from '@/lib/supabase/service'

const bulkReassignSchema = z.object({
  lead_ids: z.array(z.string().uuid()).min(1, 'At least one lead ID is required'),
  assigned_to: z.string().uuid(),
})

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_UPDATE)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const { user } = authResult
    const userRole = user.role.name

    // Only admin and super_admin can bulk reassign leads
    if (userRole !== SYSTEM_ROLES.ADMIN && userRole !== SYSTEM_ROLES.SUPER_ADMIN) {
      return NextResponse.json(
        { error: 'Forbidden: Only administrators can bulk reassign leads' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { lead_ids, assigned_to } = bulkReassignSchema.parse(body)

    // Validate that assigned_to is provided and is a valid UUID
    if (!assigned_to || assigned_to === 'undefined' || assigned_to.trim() === '') {
      return NextResponse.json(
        { error: 'assigned_to is required and must be a valid UUID' },
        { status: 400 }
      )
    }

    // Verify that the assigned user is a tele_caller
    const supabase = createServiceClient()
    const { data: assignedUser, error: userError } = await supabase
      .from('users')
      .select(`
        id,
        name,
        roles!users_role_id_fkey (
          name
        )
      `)
      .eq('id', assigned_to)
      .single()

    if (userError || !assignedUser) {
      return NextResponse.json(
        { error: 'Assigned user not found' },
        { status: 404 }
      )
    }

    const assignedUserRole = Array.isArray(assignedUser.roles) 
      ? assignedUser.roles[0]?.name 
      : (assignedUser.roles as any)?.name

    if (assignedUserRole !== SYSTEM_ROLES.TELE_CALLER) {
      return NextResponse.json(
        { error: 'Leads can only be assigned to tele-callers' },
        { status: 400 }
      )
    }

    // Bulk update leads
    const results = {
      success: [] as any[],
      failed: [] as Array<{ lead_id: string; error: string }>,
    }

    // Get current leads to create status history
    const { data: currentLeads } = await supabase
      .from('leads')
      .select('id, status, assigned_to')
      .in('id', lead_ids)

    // Update leads in batch
    const { data: updatedLeads, error: updateError } = await supabase
      .from('leads')
      .update({
        assigned_to,
        updated_at: new Date().toISOString(),
      } as any)
      .in('id', lead_ids)
      .select(`
        *,
        assigned_user:users!leads_assigned_to_fkey (
          id,
          name,
          email
        )
      `)

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to bulk reassign leads: ${updateError.message}` },
        { status: 500 }
      )
    }

    if (updatedLeads) {
      results.success = updatedLeads

      // Create status history entries for all reassigned leads
      if (currentLeads && currentLeads.length > 0) {
        const historyEntries = currentLeads.map((lead) => ({
          lead_id: lead.id,
          old_status: lead.status,
          new_status: lead.status, // Status doesn't change on reassignment
          changed_by: user.id,
          notes: `Lead bulk reassigned to ${assignedUser.name || 'tele-caller'}`,
        }))

        try {
          await supabase.from('lead_status_history').insert(historyEntries as any)
        } catch (historyError) {
          // Log but don't fail - the reassignment was successful
          console.error('Failed to create status history for bulk reassignment:', historyError)
        }
      }
    }

    // Check for any leads that weren't updated (might not exist)
    const updatedIds = new Set(updatedLeads?.map(l => l.id) || [])
    lead_ids.forEach((leadId) => {
      if (!updatedIds.has(leadId)) {
        results.failed.push({
          lead_id: leadId,
          error: 'Lead not found or could not be updated',
        })
      }
    })

    return NextResponse.json({
      message: `Successfully reassigned ${results.success.length} lead(s)`,
      success: results.success.length,
      failed: results.failed.length,
      results,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to bulk reassign leads' },
      { status: 500 }
    )
  }
}
