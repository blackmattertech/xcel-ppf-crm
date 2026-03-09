import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'

interface FacebookBusinessSettings {
  id: string
  page_id: string | null
  page_name: string | null
  ad_account_id: string | null
  ad_account_name: string | null
  business_id: string | null
  business_name: string | null
  expires_at: string | null
  is_active: boolean
  created_at: string
}

/**
 * GET /api/integrations/facebook/config
 * Get current Facebook Business connection status
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)

    if ('error' in authResult) {
      return authResult.error
    }

    const { user } = authResult
    const supabase = createServiceClient()

    const { data, error } = await supabase
      .from('facebook_business_settings')
      .select('id, page_id, page_name, ad_account_id, ad_account_name, business_id, business_name, expires_at, is_active, created_at')
      .eq('created_by', user.id)
      .eq('is_active', true)
      .maybeSingle()

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching Facebook settings:', error)
      return NextResponse.json(
        { error: 'Failed to load Facebook configuration.' },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json({ config: null })
    }

    const settings = data as FacebookBusinessSettings

    // Check if token is expired
    const isExpired = settings.expires_at
      ? new Date(settings.expires_at) < new Date()
      : false

    return NextResponse.json({
      config: {
        id: settings.id,
        pageId: settings.page_id,
        pageName: settings.page_name,
        adAccountId: settings.ad_account_id,
        adAccountName: settings.ad_account_name,
        businessId: settings.business_id,
        businessName: settings.business_name,
        isExpired,
        expiresAt: settings.expires_at,
        isActive: settings.is_active,
        connectedAt: settings.created_at,
      },
    })
  } catch (error) {
    console.error('Facebook config GET error:', error)
    return NextResponse.json(
      { error: 'Unexpected error while loading Facebook configuration.' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/integrations/facebook/config
 * Update ad account (change which ad account to use)
 */
export async function PATCH(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    const { user } = authResult
    const body = await request.json().catch(() => ({})) as { adAccountId?: string; adAccountName?: string }

    if (!body.adAccountId || typeof body.adAccountId !== 'string') {
      return NextResponse.json(
        { error: 'adAccountId is required' },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()
    const { error } = await supabase
      .from('facebook_business_settings')
      // @ts-expect-error - facebook_business_settings Update type not inferred correctly
      .update({
        ad_account_id: body.adAccountId,
        ad_account_name: body.adAccountName ?? body.adAccountId,
        updated_at: new Date().toISOString(),
      })
      .eq('created_by', user.id)
      .eq('is_active', true)

    if (error) {
      console.error('Error updating ad account:', error)
      return NextResponse.json(
        { error: 'Failed to update ad account.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Facebook config PATCH error:', error)
    return NextResponse.json(
      { error: 'Unexpected error while updating ad account.' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/integrations/facebook/config
 * Disconnect Facebook Business account
 */
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)

    if ('error' in authResult) {
      return authResult.error
    }

    const { user } = authResult
    const supabase = createServiceClient()

    // Deactivate instead of deleting to preserve history
    const { error } = await supabase
      .from('facebook_business_settings')
      // @ts-expect-error - facebook_business_settings Update type not inferred correctly
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('created_by', user.id)
      .eq('is_active', true)

    if (error) {
      console.error('Error disconnecting Facebook:', error)
      return NextResponse.json(
        { error: 'Failed to disconnect Facebook account.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Facebook disconnect error:', error)
    return NextResponse.json(
      { error: 'Unexpected error while disconnecting Facebook account.' },
      { status: 500 }
    )
  }
}
