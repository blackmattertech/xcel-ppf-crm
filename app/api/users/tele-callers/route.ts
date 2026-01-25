import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { PERMISSIONS } from '@/shared/constants/permissions'
import { createServiceClient } from '@/lib/supabase/service'
import { SYSTEM_ROLES } from '@/shared/constants/roles'

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_UPDATE)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const { user } = authResult
    const userRole = user.role.name

    // Only admin and super_admin can get tele-callers list
    if (userRole !== SYSTEM_ROLES.ADMIN && userRole !== SYSTEM_ROLES.SUPER_ADMIN) {
      return NextResponse.json(
        { error: 'Forbidden: Only administrators can access this resource' },
        { status: 403 }
      )
    }

    const supabase = createServiceClient()

    // Get tele_caller role
    const { data: teleCallerRole, error: roleError } = await supabase
      .from('roles')
      .select('id')
      .eq('name', SYSTEM_ROLES.TELE_CALLER)
      .single()

    if (roleError || !teleCallerRole) {
      return NextResponse.json(
        { error: 'Tele-caller role not found' },
        { status: 404 }
      )
    }

    // Get all users with tele_caller role
    const { data: teleCallers, error: usersError } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('role_id', teleCallerRole.id)
      .order('name', { ascending: true })

    if (usersError) {
      return NextResponse.json(
        { error: `Failed to fetch tele-callers: ${usersError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ teleCallers: teleCallers || [] })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch tele-callers' },
      { status: 500 }
    )
  }
}
