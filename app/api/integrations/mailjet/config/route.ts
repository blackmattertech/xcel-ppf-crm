import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'

const TABLE = 'mailjet_settings'
const SINGLETON_ID = 1

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)

    if ('error' in authResult) {
      return authResult.error
    }

    const supabase = createServiceClient()

    const { data, error } = await supabase
      .from(TABLE)
      .select('api_key, api_secret, sender_email')
      .eq('id', SINGLETON_ID)
      .maybeSingle()

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching Mailjet settings:', error)
      return NextResponse.json(
        { error: 'Failed to load Mailjet configuration.' },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json({ config: null })
    }

    return NextResponse.json({
      config: {
        apiKey: data.api_key,
        apiSecret: data.api_secret,
        senderEmail: data.sender_email,
      },
    })
  } catch (error) {
    console.error('Mailjet config GET error:', error)
    return NextResponse.json(
      { error: 'Unexpected error while loading Mailjet configuration.' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)

    if ('error' in authResult) {
      return authResult.error
    }

    const body = await request.json()
    const {
      apiKey,
      apiSecret,
      senderEmail,
    }: { apiKey?: string; apiSecret?: string; senderEmail?: string } = body

    if (!apiKey || !apiSecret || !senderEmail) {
      return NextResponse.json(
        { error: 'Missing required fields (apiKey, apiSecret, senderEmail).' },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()

    const { error } = await supabase.from(TABLE).upsert(
      {
        id: SINGLETON_ID,
        api_key: apiKey,
        api_secret: apiSecret,
        sender_email: senderEmail,
      },
      { onConflict: 'id' }
    )

    if (error) {
      console.error('Error saving Mailjet settings:', error)
      return NextResponse.json(
        { error: 'Failed to save Mailjet configuration.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Mailjet config PUT error:', error)
    return NextResponse.json(
      { error: 'Unexpected error while saving Mailjet configuration.' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)

    if ('error' in authResult) {
      return authResult.error
    }

    const supabase = createServiceClient()
    const { error } = await supabase.from(TABLE).delete().eq('id', SINGLETON_ID)

    if (error) {
      console.error('Error deleting Mailjet settings:', error)
      return NextResponse.json(
        { error: 'Failed to clear Mailjet configuration.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Mailjet config DELETE error:', error)
    return NextResponse.json(
      { error: 'Unexpected error while clearing Mailjet configuration.' },
      { status: 500 }
    )
  }
}

