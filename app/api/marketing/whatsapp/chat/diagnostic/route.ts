import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * GET /api/marketing/whatsapp/chat/diagnostic
 * Checks if whatsapp_messages table exists and can be written to.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error

  const supabase = createServiceClient()
  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)/)?.[1] ?? 'unknown'

  // 1. Check if table exists (try a simple select)
  const { data: existing, error: selectError } = await supabase
    .from('whatsapp_messages')
    .select('id')
    .limit(1)

  if (selectError) {
    return NextResponse.json({
      ok: false,
      project: projectRef,
      error: selectError.code,
      message: selectError.message,
      hint:
        selectError.code === '42P01'
          ? 'Table whatsapp_messages does not exist. Run migration 019 in Supabase SQL Editor.'
          : selectError.code === '42501'
            ? 'Permission denied. Check RLS policies or use service role.'
            : undefined,
    })
  }

  // 2. Try a test insert (then delete it)
  const testPhone = '910000000000'
  const { data: inserted, error: insertError } = await supabase
    .from('whatsapp_messages')
    .insert({
      lead_id: null,
      phone: testPhone,
      direction: 'out',
      body: '[diagnostic test - will be deleted]',
      meta_message_id: null,
    } as never)
    .select('id')
    .single()

  if (insertError) {
    return NextResponse.json({
      ok: false,
      project: projectRef,
      tableExists: true,
      insertError: insertError.code,
      insertMessage: insertError.message,
      hint:
        insertError.code === '23503'
          ? 'Foreign key violation. lead_id references leads(id) - ensure lead exists.'
          : insertError.code === '42501'
            ? 'Permission denied on insert.'
            : undefined,
    })
  }

  // Delete the test row (type assertion: Supabase infers 'never' with insert as never)
  const insertedRow = inserted as { id: string } | null
  if (insertedRow?.id) {
    await supabase.from('whatsapp_messages').delete().eq('id', insertedRow.id)
  }

  return NextResponse.json({
    ok: true,
    project: projectRef,
    tableExists: true,
    insertWorks: true,
  })
}
