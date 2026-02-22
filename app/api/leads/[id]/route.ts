import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { getLeadById, updateLead, deleteLead } from '@/backend/services/lead.service'
import { z } from 'zod'
import { PERMISSIONS } from '@/shared/constants/permissions'
import { invalidateLeadCaches } from '@/lib/cache-invalidation'

const updateLeadSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  email: z.string().email().nullable().optional(),
  status: z.enum([
    'new',
    'contacted',        // NEW: After first call attempt
    'qualified', 
    'unqualified', 
    'quotation_shared',
    'quotation_viewed',
    'quotation_accepted',
    'quotation_expired',
    'interested', 
    'negotiation', 
    'lost',
    'discarded',        // NEW: Explicit discarded status
    'converted',
    'deal_won',
    'payment_pending',
    'advance_received',
    'fully_paid'
  ]).optional(),
  interest_level: z.enum(['hot', 'warm', 'cold']).nullable().optional(),
  budget_range: z.string().nullable().optional(),
  requirement: z.string().nullable().optional(),
  timeline: z.string().nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  payment_status: z.enum(['pending', 'advance_received', 'fully_paid']).nullable().optional(),
  payment_amount: z.number().nonnegative().nullable().optional(),
  advance_amount: z.number().nonnegative().nullable().optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_READ)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const { user } = authResult
    const userRole = user.role.name
    const userId = user.id

    const lead = await getLeadById(id, userId, userRole)
    return NextResponse.json({ lead })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch lead'
    const status = errorMessage.includes('Forbidden') ? 403 : 500
    return NextResponse.json(
      { error: errorMessage },
      { status }
    )
  }
}

export async function PUT(
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
    const userId = user.id

    // For tele_callers, verify they can only update their assigned leads
    if (userRole === 'tele_caller') {
      const lead = await getLeadById(id, userId, userRole)
      if ((lead as any).assigned_to !== userId) {
        return NextResponse.json(
          { error: 'Forbidden: You can only update leads assigned to you' },
          { status: 403 }
        )
      }
    }

    const body = await request.json()
    const updates = updateLeadSchema.parse(body)

    // Tele_callers cannot reassign leads (only admins can)
    if (userRole === 'tele_caller' && updates.assigned_to !== undefined) {
      return NextResponse.json(
        { error: 'Forbidden: Only administrators can reassign leads' },
        { status: 403 }
      )
    }

    const lead = await updateLead(id, updates as any)

    // Invalidate related caches
    await invalidateLeadCaches(id)

    return NextResponse.json({ lead })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      )
    }

    const errorMessage = error instanceof Error ? error.message : 'Failed to update lead'
    const status = errorMessage.includes('Forbidden') ? 403 : 500
    return NextResponse.json(
      { error: errorMessage },
      { status }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_DELETE)
    
    if ('error' in authResult) {
      return authResult.error
    }

    await deleteLead(id)
    
    // Invalidate related caches
    await invalidateLeadCaches(id)

    return NextResponse.json({ message: 'Lead deleted successfully' })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete lead' },
      { status: 500 }
    )
  }
}
