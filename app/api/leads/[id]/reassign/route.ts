import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { updateLead } from '@/backend/services/lead.service'
import { PERMISSIONS } from '@/shared/constants/permissions'
import { z } from 'zod'

interface UserWithRole {
  id: string
  name?: string
  roles: {
    name: string
  } | {
    name: string
  }[] | null
}
import { SYSTEM_ROLES } from '@/shared/constants/roles'

const reassignLeadSchema = z.object({
  assigned_to: z.string().uuid(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_UPDATE)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const { user } = authResult
    const userRole = user.role.name

    // Only admin and super_admin can reassign leads
    if (userRole !== SYSTEM_ROLES.ADMIN && userRole !== SYSTEM_ROLES.SUPER_ADMIN) {
      return NextResponse.json(
        { error: 'Forbidden: Only administrators can reassign leads' },
        { status: 403 }
      )
    }

    const body = await request.json()
    
    // Validate that assigned_to is provided and is a valid UUID
    if (!body.assigned_to || body.assigned_to === 'undefined' || body.assigned_to.trim() === '') {
      return NextResponse.json(
        { error: 'assigned_to is required and must be a valid UUID' },
        { status: 400 }
      )
    }

    const { assigned_to } = reassignLeadSchema.parse(body)

    // Verify that the assigned user is a tele_caller
    const supabase = (await import('@/lib/supabase/service')).createServiceClient()
    const { data: assignedUserData, error: userError } = await supabase
      .from('users')
      .select(`
        id,
        roles!users_role_id_fkey (
          name
        )
      `)
      .eq('id', assigned_to)
      .single()

    const assignedUser = assignedUserData as UserWithRole | null

    if (userError || !assignedUser) {
      return NextResponse.json(
        { error: 'Assigned user not found' },
        { status: 404 }
      )
    }

    const assignedUserRole = Array.isArray(assignedUser.roles) 
      ? assignedUser.roles[0]?.name 
      : assignedUser.roles?.name || null

    if (assignedUserRole !== SYSTEM_ROLES.TELE_CALLER) {
      return NextResponse.json(
        { error: 'Leads can only be assigned to tele-callers' },
        { status: 400 }
      )
    }

    // Update the lead assignment
    const lead = await updateLead(id, {
      assigned_to,
    })

    // Create status history entry for the reassignment
    try {
      await supabase.from('lead_status_history').insert({
        lead_id: id,
        old_status: (lead as any).status,
        new_status: (lead as any).status,
        changed_by: user.id,
        notes: `Lead reassigned to ${assignedUser.name || 'tele-caller'}`,
      } as any)
    } catch (historyError) {
      // Log but don't fail - the reassignment was successful
      console.error('Failed to create status history for reassignment:', historyError)
    }

    return NextResponse.json({ 
      lead,
      message: 'Lead reassigned successfully' 
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to reassign lead' },
      { status: 500 }
    )
  }
}
