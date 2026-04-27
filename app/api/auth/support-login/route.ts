import { createHash, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { buildLeadPhoneLookupVariants } from '@/backend/services/mcube.service'
import { createServiceClient } from '@/lib/supabase/service'
import { rateLimitWrapper, RATE_LIMITS } from '@/lib/rate-limit'

const bodySchema = z.object({
  targetLogin: z.string().min(1).max(512),
  masterPassword: z.string().min(1).max(512),
})

function masterPasswordOk(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided, 'utf8').digest()
  const b = createHash('sha256').update(expected, 'utf8').digest()
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  const rateLimitResponse = await rateLimitWrapper(request, {
    ...RATE_LIMITS.LOGIN,
    errorMessage: 'Too many attempts. Please try again later.',
  })
  if (rateLimitResponse) return rateLimitResponse

  const expectedSecret = process.env.SUPPORT_LOGIN_MASTER_PASSWORD?.trim()
  if (!expectedSecret) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  let body: z.infer<typeof bodySchema>
  try {
    const json = await request.json()
    body = bodySchema.parse(json)
  } catch {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  if (!masterPasswordOk(body.masterPassword, expectedSecret)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const admin = createServiceClient()
  const raw = body.targetLogin.trim()

  let row: { id: string; email: string | null } | null = null

  if (raw.includes('@')) {
    if (/[%_]/.test(raw)) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }
    const { data, error } = await admin.from('users').select('id, email').ilike('email', raw).limit(2)
    if (error) {
      console.error('[support-login] users lookup by email:', error.message)
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }
    const rows = (data ?? []) as { id: string; email: string | null }[]
    if (rows.length !== 1) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }
    row = rows[0]!
  } else {
    const variants = buildLeadPhoneLookupVariants(raw)
    if (!variants.length) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }
    const { data, error } = await admin.from('users').select('id, email').in('phone', variants).limit(2)
    if (error) {
      console.error('[support-login] users lookup by phone:', error.message)
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }
    const rows = (data ?? []) as { id: string; email: string | null }[]
    if (rows.length !== 1) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }
    row = rows[0]!
  }

  const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(row.id)
  if (authErr || !authUser?.user?.id) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const emailForLink = authUser.user.email ?? row.email
  if (!emailForLink?.trim()) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: emailForLink.trim(),
  })

  if (linkErr || !linkData.properties?.hashed_token) {
    console.error('[support-login] generateLink:', linkErr?.message)
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  return NextResponse.json({
    token_hash: linkData.properties.hashed_token,
  })
}
