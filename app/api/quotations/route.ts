import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createQuotation, getQuotations } from '@/backend/services/quotation.service'
import { z } from 'zod'

const createQuotationSchema = z.object({
  lead_id: z.string().uuid(),
  items: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    quantity: z.number().positive(),
    unit_price: z.number().nonnegative(),
    total: z.number().nonnegative(),
  })),
  validity_days: z.number().positive().default(30),
  discount: z.number().nonnegative().default(0),
  gst_rate: z.number().nonnegative().default(18),
})

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const body = await request.json()
    const quotationData = createQuotationSchema.parse(body)

    const quotation = await createQuotation(
      quotationData.lead_id,
      quotationData.items,
      quotationData.validity_days,
      quotationData.discount,
      quotationData.gst_rate,
      authResult.user.id
    )

    return NextResponse.json({ quotation }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create quotation' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const searchParams = request.nextUrl.searchParams
    const filters = {
      leadId: searchParams.get('leadId') || undefined,
      status: searchParams.get('status') || undefined,
      createdBy: searchParams.get('createdBy') || undefined,
    }

    try {
      const quotations = await getQuotations(filters)
      return NextResponse.json({ quotations: quotations || [] })
    } catch (error) {
      // If table doesn't exist, return empty array
      if (error instanceof Error && error.message.includes('42P01')) {
        return NextResponse.json({ quotations: [] })
      }
      throw error
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch quotations' },
      { status: 500 }
    )
  }
}
