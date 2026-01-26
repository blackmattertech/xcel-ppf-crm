import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { getAllLeads, createLead } from '@/backend/services/lead.service'
import { createServiceClient } from '@/lib/supabase/service'
import { z } from 'zod'
import { PERMISSIONS } from '@/shared/constants/permissions'

const createLeadSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().nullable().optional(),
  source: z.enum(['meta', 'manual', 'form', 'whatsapp', 'ivr']),
  campaign_id: z.string().nullable().optional(),
  ad_id: z.string().nullable().optional(),
  adset_id: z.string().nullable().optional(),
  form_id: z.string().nullable().optional(),
  form_name: z.string().nullable().optional(),
  ad_name: z.string().nullable().optional(),
  campaign_name: z.string().nullable().optional(),
  meta_data: z.any().nullable().optional(),
  interest_level: z.enum(['hot', 'warm', 'cold']).nullable().optional(),
  budget_range: z.string().nullable().optional(),
  requirement: z.string().nullable().optional(),
  timeline: z.string().nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_READ)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const { user } = authResult
    const userRole = user.role.name
    const userId = user.id

    const searchParams = request.nextUrl.searchParams
    const filters = {
      status: searchParams.get('status') || undefined,
      source: searchParams.get('source') || undefined,
      assignedTo: searchParams.get('assignedTo') || undefined,
      // Default pagination to prevent loading all leads at once
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 100,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0,
      userId: userRole === 'tele_caller' ? userId : undefined, // Filter by user ID for tele_callers
      userRole: userRole, // Pass user role for filtering
      // For tele-callers, include converted leads info for accurate conversion rate calculation
      // (but converted leads are still excluded from the returned list)
      includeConverted: userRole === 'tele_caller' ? true : false,
    }

    const leads = await getAllLeads(filters)
    
    // For admins, include overall conversion stats across all tele-callers
    let overallStats = null
    if (userRole === 'admin' || userRole === 'super_admin') {
      const supabase = createServiceClient()
      
      // Get all leads assigned to tele-callers (including converted ones)
      const { data: allTeleCallerLeads } = await supabase
        .from('leads')
        .select('id')
        .not('assigned_to', 'is', null)
      
      // Get all customers converted from those leads
      if (allTeleCallerLeads && allTeleCallerLeads.length > 0) {
        const allLeadIds = allTeleCallerLeads.map((l: any) => l.id)
        const { data: customers } = await supabase
          .from('customers')
          .select('lead_id')
          .in('lead_id', allLeadIds)
          .not('lead_id', 'is', null)
        
        const totalLeads = allTeleCallerLeads.length
        const convertedLeads = customers?.length || 0
        
        overallStats = {
          totalLeads,
          convertedLeads,
          conversionRate: totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0
        }
      }
    }
    
    return NextResponse.json({ 
      leads,
      overallStats // Include overall stats for admins
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch leads' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_CREATE)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const body = await request.json()
    const leadData = createLeadSchema.parse(body)

    const lead = await createLead(leadData, true) // Auto-assign enabled

    return NextResponse.json({ lead }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create lead' },
      { status: 500 }
    )
  }
}
