import { NextRequest, NextResponse } from 'next/server'
import { parseMetaWebhook } from '@/backend/services/meta-webhook.service'
import { createLead } from '@/backend/services/lead.service'
import { MetaWebhookPayload } from '@/shared/types/meta-lead'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as MetaWebhookPayload

    // Validate webhook structure
    if (!body.entry || !Array.isArray(body.entry) || body.entry.length === 0) {
      return NextResponse.json(
        { error: 'Invalid webhook payload structure' },
        { status: 400 }
      )
    }

    // Parse Meta leads
    const parsedLeads = parseMetaWebhook(body)

    const createdLeads: any[] = []

    for (const parsedLead of parsedLeads) {
      // Validate required fields
      if (!parsedLead.phone) {
        console.warn('Skipping lead without phone number:', parsedLead)
        continue
      }

      try {
        // Generate lead_id (format: LEAD-YYYYMMDD-HHMMSS-XXXX)
        const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').split('.')[0]
        const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase()
        const lead_id = `LEAD-${timestamp}-${randomSuffix}`
        
        const lead = await createLead({
          lead_id,
          name: parsedLead.name,
          phone: parsedLead.phone,
          email: parsedLead.email || null,
          source: 'meta',
          campaign_id: parsedLead.campaignId || null,
          ad_id: parsedLead.adId || null,
          adset_id: parsedLead.adsetId || null,
          form_id: parsedLead.formId || null,
          form_name: parsedLead.formName || null,
          ad_name: parsedLead.adName || null,
          campaign_name: parsedLead.campaignName || null,
          meta_data: parsedLead.metaData,
          status: 'new',
        } as any, true) // Auto-assign enabled

        createdLeads.push(lead)
      } catch (error) {
        console.error('Error creating lead from Meta webhook:', error)
        // Continue processing other leads
      }
    }

    return NextResponse.json({
      message: 'Webhook processed successfully',
      leadsCreated: createdLeads.length,
      leads: createdLeads,
    })
  } catch (error) {
    console.error('Meta webhook error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process webhook' },
      { status: 500 }
    )
  }
}

// Handle GET for webhook verification (Meta may send GET requests)
export async function GET(request: NextRequest) {
  const verifyToken = request.nextUrl.searchParams.get('hub.verify_token')
  const challenge = request.nextUrl.searchParams.get('hub.challenge')

  // You should set this token in your Meta app settings
  const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN || 'your_verify_token'

  if (verifyToken === expectedToken && challenge) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Invalid verification token' }, { status: 403 })
}
