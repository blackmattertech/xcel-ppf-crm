import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { z } from 'zod'

const updateSchema = z.object({
  hideConnectedWhenLastMcubeNotConnected: z.boolean(),
})

function isAdminRole(roleName: string | null | undefined): boolean {
  return roleName === 'admin' || roleName === 'super_admin'
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('mcube_settings')
      .select('hide_connected_when_last_mcube_not_connected')
      .eq('id', true)
      .maybeSingle()

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ error: 'Failed to load MCUBE settings' }, { status: 500 })
    }

    const row = data as { hide_connected_when_last_mcube_not_connected: boolean } | null
    return NextResponse.json({
      settings: {
        hideConnectedWhenLastMcubeNotConnected:
          row?.hide_connected_when_last_mcube_not_connected ?? true,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    if (!isAdminRole(authResult.user.role?.name)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { error } = await supabase
      .from('mcube_settings')
      .upsert({
        id: true,
        hide_connected_when_last_mcube_not_connected:
          parsed.data.hideConnectedWhenLastMcubeNotConnected,
        updated_by: authResult.user.id,
      } as never)

    if (error) {
      return NextResponse.json({ error: 'Failed to update MCUBE settings' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 500 }
    )
  }
}
