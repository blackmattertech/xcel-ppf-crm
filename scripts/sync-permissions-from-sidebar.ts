/**
 * Script to sync ALL sidebar options to the permissions table.
 * Every sidebar resource gets .read and .manage so you can give/revoke access per role in Roles & Permissions.
 *
 * Run with: npx tsx scripts/sync-permissions-from-sidebar.ts
 */

import { createServiceClient } from '@/lib/supabase/service'
import {
  SIDEBAR_MENU_ITEMS,
  generatePermissionsForResource,
  getResourcesRequiringPermissions,
} from '@/shared/constants/sidebar'

async function syncPermissions() {
  console.log('🔄 Syncing ALL sidebar options to permissions table...\n')

  const supabase = createServiceClient()

  // All unique resources from sidebar (every item is permission-gated)
  const allResources = Array.from(
    new Set(SIDEBAR_MENU_ITEMS.map((item) => item.resource))
  )
  const crudResources = getResourcesRequiringPermissions()

  console.log(`📋 Sidebar resources (all): ${allResources.join(', ')}`)
  console.log(`📋 Resources with full CRUD: ${crudResources.join(', ')}\n`)

  let createdCount = 0
  let existingCount = 0
  let errorCount = 0

  for (const resource of allResources) {
    const useFullCrud = crudResources.includes(resource)
    const permissions = useFullCrud
      ? generatePermissionsForResource(resource)
      : [
          { name: `${resource}.read`, resource, action: 'read' as const, description: `View ${resource}` },
          { name: `${resource}.manage`, resource, action: 'manage' as const, description: `Full ${resource} access` },
        ]

    console.log(`📦 Processing resource: ${resource} (${useFullCrud ? 'full CRUD' : 'read/manage'})`)

    for (const permission of permissions) {
      try {
        const { data: existing } = await supabase
          .from('permissions')
          .select('id, name')
          .eq('name', permission.name)
          .single()

        if (existing) {
          console.log(`   ✓ Already exists: ${permission.name}`)
          existingCount++
        } else {
          const { error } = await supabase
            .from('permissions')
            // @ts-expect-error - dynamic insert in script
            .insert({
              name: permission.name,
              resource: permission.resource,
              action: permission.action,
              description: permission.description ?? undefined,
            })
            .select()
            .single()

          if (error) {
            console.error(`   ✗ Error creating ${permission.name}:`, error.message)
            errorCount++
          } else {
            console.log(`   ✓ Created: ${permission.name}`)
            createdCount++
          }
        }
      } catch (err) {
        console.error(`   ✗ Unexpected error for ${permission.name}:`, err)
        errorCount++
      }
    }
  }

  console.log('\n' + '='.repeat(50))
  console.log('📊 Sync Summary:')
  console.log(`   ✓ Created: ${createdCount}`)
  console.log(`   ⊙ Existing: ${existingCount}`)
  console.log(`   ✗ Errors: ${errorCount}`)
  console.log('='.repeat(50))

  if (errorCount === 0) {
    console.log('\n✅ Sidebar permissions synced. Manage access in Admin > Roles & Permissions.')
  } else {
    console.log('\n⚠️  Sync finished with errors. Check output above.')
  }
}

// Run the sync
syncPermissions()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Fatal error during permission sync:', error)
    process.exit(1)
  })
