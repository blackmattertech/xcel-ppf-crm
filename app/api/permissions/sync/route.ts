import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { SYSTEM_ROLES } from '@/shared/constants/roles'
import { createServiceClient } from '@/lib/supabase/service'
import { getResourcesRequiringPermissions, generatePermissionsForResource } from '@/shared/constants/sidebar'

/**
 * API endpoint to sync permissions from sidebar configuration
 * Only accessible by admin and super_admin
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) {
      return authResult.error
    }

    const { user } = authResult
    const userRole = user.role?.name

    // Only admin and super_admin can sync permissions
    if (userRole !== SYSTEM_ROLES.ADMIN && userRole !== SYSTEM_ROLES.SUPER_ADMIN) {
      console.error('Permission sync denied. User role:', userRole, 'Expected:', SYSTEM_ROLES.ADMIN, 'or', SYSTEM_ROLES.SUPER_ADMIN)
      return NextResponse.json(
        { error: `Forbidden: Only administrators can sync permissions. Your role: ${userRole || 'unknown'}` },
        { status: 403 }
      )
    }

    console.log('Permission sync started by:', user.name, 'Role:', userRole)

    const supabase = createServiceClient()
    const resources = getResourcesRequiringPermissions()
    
    console.log('Resources requiring permissions:', resources)
    
    if (resources.length === 0) {
      return NextResponse.json({
        message: 'No resources found that require permissions',
        summary: {
          created: 0,
          existing: 0,
          errors: 0,
        },
        details: {
          created: [],
          existing: [],
          errors: [],
        },
      })
    }
    
    const results = {
      created: [] as string[],
      existing: [] as string[],
      errors: [] as string[],
    }

    // Generate and insert permissions for each resource
    for (const resource of resources) {
      const permissions = generatePermissionsForResource(resource)
      
      for (const permission of permissions) {
        try {
          // Check if permission already exists (use maybeSingle to avoid errors when not found)
          const { data: existing, error: checkError } = await supabase
            .from('permissions')
            .select('id, name')
            .eq('name', permission.name)
            .maybeSingle()
          
          if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned
            results.errors.push(`${permission.name}: Check error - ${checkError.message}`)
            continue
          }
          
          if (existing) {
            results.existing.push(permission.name)
          } else {
            // Insert new permission
            const { data, error: insertError } = await supabase
              .from('permissions')
              .insert({
                name: permission.name,
                resource: permission.resource,
                action: permission.action,
                description: permission.description,
              })
              .select()
              .single()
            
            if (insertError) {
              results.errors.push(`${permission.name}: ${insertError.message}`)
            } else if (data) {
              results.created.push(permission.name)
            }
          }
        } catch (error) {
          results.errors.push(`${permission.name}: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }
    }

    return NextResponse.json({
      message: 'Permission sync completed',
      summary: {
        created: results.created.length,
        existing: results.existing.length,
        errors: results.errors.length,
      },
      details: results,
    })
  } catch (error) {
    console.error('Error syncing permissions:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync permissions' },
      { status: 500 }
    )
  }
}
