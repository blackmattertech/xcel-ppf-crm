import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'

interface WhatsAppBusinessSettings {
  id: string
  waba_id: string
  waba_name: string | null
  phone_number_id: string
  phone_number_display: string | null
  expires_at: string | null
  is_active: boolean
  created_at: string
}

/**
 * GET /api/integrations/whatsapp/config
 * Get current WhatsApp Business connection status (linked from frontend).
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
      .from('whatsapp_business_settings')
      .select('id, waba_id, waba_name, phone_number_id, phone_number_display, expires_at, is_active, created_at')
      .eq('created_by', user.id)
      .eq('is_active', true)
      .maybeSingle()

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching WhatsApp settings:', error)
      return NextResponse.json(
        { error: 'Failed to load WhatsApp configuration.' },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json({ config: null })
    }

    const settings = data as WhatsAppBusinessSettings

    return NextResponse.json({
      config: {
        id: settings.id,
        wabaId: settings.waba_id,
        wabaName: settings.waba_name,
        phoneNumberId: settings.phone_number_id,
        phoneNumberDisplay: settings.phone_number_display,
        isExpired: settings.expires_at ? new Date(settings.expires_at) < new Date() : false,
        expiresAt: settings.expires_at,
        isActive: settings.is_active,
        connectedAt: settings.created_at,
      },
    })
  } catch (error) {
    console.error('WhatsApp config GET error:', error)
    return NextResponse.json(
      { error: 'Unexpected error while loading WhatsApp configuration.' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/integrations/whatsapp/config
 * Link WhatsApp Business account by ID (WABA ID, Phone Number ID, Access Token).
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)

    if ('error' in authResult) {
      return authResult.error
    }

    const { user } = authResult
    const body = await request.json().catch(() => ({})) as {
      wabaId?: string
      phoneNumberId?: string
      accessToken?: string
      wabaName?: string
      phoneNumberDisplay?: string
    }

    const wabaId = body.wabaId?.trim()
    const phoneNumberId = body.phoneNumberId?.trim()
    const accessToken = body.accessToken?.trim()

    if (!wabaId || !phoneNumberId || !accessToken) {
      return NextResponse.json(
        {
          error: 'Missing required fields',
          detail: 'wabaId, phoneNumberId, and accessToken are required.',
        },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()

    // Check if connection already exists
    const { data: existingData } = await supabase
      .from('whatsapp_business_settings')
      .select('id')
      .eq('created_by', user.id)
      .eq('is_active', true)
      .maybeSingle()

    const existing = existingData as { id: string } | null

    const settingsData = {
      waba_id: wabaId,
      waba_name: body.wabaName?.trim() || null,
      phone_number_id: phoneNumberId,
      phone_number_display: body.phoneNumberDisplay?.trim() || null,
      access_token: accessToken,
      is_active: true,
      created_by: user.id,
      updated_at: new Date().toISOString(),
    }

    if (existing) {
      const { error: updateError } = await supabase
        .from('whatsapp_business_settings')
        // @ts-ignore - Supabase type inference
        .update(settingsData)
        .eq('id', existing.id)

      if (updateError) {
        console.error('Error updating WhatsApp settings:', updateError)
        return NextResponse.json(
          { error: 'Failed to update WhatsApp connection.' },
          { status: 500 }
        )
      }
    } else {
      const { error: insertError } = await supabase
        .from('whatsapp_business_settings')
        // @ts-expect-error - Supabase generated types may not include this table
        .insert(settingsData)

      if (insertError) {
        console.error('Error saving WhatsApp settings:', insertError)
        return NextResponse.json(
          { error: 'Failed to save WhatsApp connection.' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('WhatsApp config POST error:', error)
    return NextResponse.json(
      { error: 'Unexpected error while saving WhatsApp configuration.' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/integrations/whatsapp/config
 * Disconnect WhatsApp Business account.
 */
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)

    if ('error' in authResult) {
      return authResult.error
    }

    const { user } = authResult
    const supabase = createServiceClient()

    const { error } = await supabase
      .from('whatsapp_business_settings')
      // @ts-ignore - Supabase type inference
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('created_by', user.id)
      .eq('is_active', true)

    if (error) {
      console.error('Error disconnecting WhatsApp:', error)
      return NextResponse.json(
        { error: 'Failed to disconnect WhatsApp account.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('WhatsApp disconnect error:', error)
    return NextResponse.json(
      { error: 'Unexpected error while disconnecting WhatsApp.' },
      { status: 500 }
    )
  }
}
