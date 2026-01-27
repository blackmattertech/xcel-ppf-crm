import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { getAllLeads, createLead } from '@/backend/services/lead.service'
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
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined,
      userId: userRole === 'tele_caller' ? userId : undefined, // Filter by user ID for tele_callers
      userRole: userRole, // Pass user role for filtering
    }

    const leads = await getAllLeads(filters)
    return NextResponse.json({ leads })
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
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create lead' },
      { status: 500 }
    )
  }
}
