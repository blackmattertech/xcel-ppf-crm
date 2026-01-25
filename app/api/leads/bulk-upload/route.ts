import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { createLeadsBatch } from '@/backend/services/lead.service'
import { PERMISSIONS } from '@/shared/constants/permissions'
import { z } from 'zod'

// Schema for a single lead from uploaded file
const uploadedLeadSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().nullable().optional().or(z.literal('')),
  source: z.enum(['meta', 'manual', 'form', 'whatsapp', 'ivr']).default('manual'),
  campaign_id: z.string().nullable().optional().or(z.literal('')),
  ad_id: z.string().nullable().optional().or(z.literal('')),
  adset_id: z.string().nullable().optional().or(z.literal('')),
  form_id: z.string().nullable().optional().or(z.literal('')),
  form_name: z.string().nullable().optional().or(z.literal('')),
  ad_name: z.string().nullable().optional().or(z.literal('')),
  campaign_name: z.string().nullable().optional().or(z.literal('')),
  requirement: z.string().nullable().optional().or(z.literal('')),
  meta_data: z.any().nullable().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_CREATE)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const body = await request.json()
    const { leads } = body

    if (!Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json(
        { error: 'Invalid input: leads must be a non-empty array' },
        { status: 400 }
      )
    }

    // Get the current user ID for status history
    const currentUserId = 'user' in authResult ? authResult.user.id : null

    // Validate all leads first
    const validatedLeads: any[] = []
    const validationErrors: Array<{ row: number; data: any; error: string }> = []

    for (let i = 0; i < leads.length; i++) {
      const leadData = leads[i]
      
      try {
        // Clean phone number before validation
        let cleanedPhone = leadData.phone || ''
        if (cleanedPhone) {
          // Remove "p:" prefix and other common phone prefixes
          cleanedPhone = cleanedPhone.replace(/^(p|tel|phone|mobile):/i, '').trim()
        }

        const validated = uploadedLeadSchema.parse({
          ...leadData,
          phone: cleanedPhone,
          email: leadData.email || null,
          campaign_id: leadData.campaign_id || null,
          ad_id: leadData.ad_id || null,
          adset_id: leadData.adset_id || null,
          form_id: leadData.form_id || null,
          form_name: leadData.form_name || null,
          ad_name: leadData.ad_name || null,
          campaign_name: leadData.campaign_name || null,
          requirement: leadData.requirement || null,
        })

        // Generate lead_id if not provided
        const lead_id = leadData.lead_id || `LEAD-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`

        validatedLeads.push({
          ...validated,
          lead_id,
          phone: cleanedPhone, // Use cleaned phone
          email: validated.email || null,
        })
      } catch (error) {
        validationErrors.push({
          row: i + 1,
          data: leadData,
          error: error instanceof Error ? error.message : 'Validation failed',
        })
      }
    }

    // Batch create all validated leads at once (much faster!)
    const batchResults = await createLeadsBatch(validatedLeads, true, currentUserId)

    // Map batch results to include row numbers
    const results = {
      success: batchResults.success,
      failed: [
        ...validationErrors,
        ...batchResults.failed.map(f => ({
          row: f.index + 1,
          data: f.data,
          error: f.error,
        })),
      ],
    }

    return NextResponse.json({
      message: `Processed ${leads.length} leads`,
      success: results.success.length,
      failed: results.failed.length,
      results,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload leads' },
      { status: 500 }
    )
  }
}
