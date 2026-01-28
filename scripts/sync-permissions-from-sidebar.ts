/**
 * Script to sync permissions from sidebar configuration
 * This ensures that when new features are added to the sidebar,
 * corresponding permissions are automatically created in the database
 * 
 * Run with: npx tsx scripts/sync-permissions-from-sidebar.ts
 */

import { createServiceClient } from '@/lib/supabase/service'
import { SIDEBAR_MENU_ITEMS, generatePermissionsForResource, getResourcesRequiringPermissions } from '@/shared/constants/sidebar'

async function syncPermissions() {
  console.log('🔄 Starting permission sync from sidebar configuration...\n')
  
  const supabase = createServiceClient()
  
  // Get all resources that require permissions
  const resources = getResourcesRequiringPermissions()
  console.log(`📋 Found ${resources.length} resources requiring permissions:`, resources.join(', '))
  
  let createdCount = 0
  let existingCount = 0
  let errorCount = 0
  
  // Generate and insert permissions for each resource
  for (const resource of resources) {
    const permissions = generatePermissionsForResource(resource)
    
    console.log(`\n📦 Processing resource: ${resource}`)
    
    for (const permission of permissions) {
      try {
        // Check if permission already exists
        const { data: existing } = await supabase
          .from('permissions')
          .select('id, name')
          .eq('name', permission.name)
          .single()
        
        if (existing) {
          console.log(`   ✓ Permission already exists: ${permission.name}`)
          existingCount++
        } else {
          // Insert new permission
          const { data, error } = await supabase
            .from('permissions')
            // @ts-ignore - Supabase type inference issue with dynamic inserts in script
            .insert({
              name: permission.name,
              resource: permission.resource,
              action: permission.action,
              description: permission.description,
            })
            .select()
            .single()
          
          if (error) {
            console.error(`   ✗ Error creating permission ${permission.name}:`, error.message)
            errorCount++
          } else {
            console.log(`   ✓ Created permission: ${permission.name}`)
            createdCount++
          }
        }
      } catch (error) {
        console.error(`   ✗ Unexpected error for ${permission.name}:`, error)
        errorCount++
      }
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(50))
  console.log('📊 Sync Summary:')
  console.log(`   ✓ Created: ${createdCount} permissions`)
  console.log(`   ⊙ Existing: ${existingCount} permissions`)
  console.log(`   ✗ Errors: ${errorCount} permissions`)
  console.log('='.repeat(50))
  
  if (errorCount === 0) {
    console.log('\n✅ Permission sync completed successfully!')
  } else {
    console.log('\n⚠️  Permission sync completed with errors. Please review the output above.')
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
