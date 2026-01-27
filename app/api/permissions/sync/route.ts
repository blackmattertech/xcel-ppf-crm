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
      return NextResponse.json(
        { error: 'Forbidden: Only administrators can sync permissions' },
        { status: 403 }
      )
    }

    const supabase = createServiceClient()
    const resources = getResourcesRequiringPermissions()
    
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
          // Check if permission already exists
          const { data: existing } = await supabase
            .from('permissions')
            .select('id, name')
            .eq('name', permission.name)
            .single()
          
          if (existing) {
            results.existing.push(permission.name)
          } else {
            // Insert new permission
            const { data, error } = await supabase
              .from('permissions')
              // @ts-ignore - Supabase type inference issue with dynamic inserts
              .insert({
                name: permission.name,
                resource: permission.resource,
                action: permission.action,
                description: permission.description,
              })
              .select()
              .single()
            
            if (error) {
              results.errors.push(`${permission.name}: ${error.message}`)
            } else {
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
