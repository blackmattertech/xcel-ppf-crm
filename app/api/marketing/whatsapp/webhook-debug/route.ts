import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'

/**
 * GET /api/marketing/whatsapp/webhook-debug
 * Auth-only sanity checks for inbound WhatsApp webhooks (no secrets returned).
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('error' in authResult) return authResult.error

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const ref = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? null

  return NextResponse.json({
    webhookUrl: 'POST /api/webhooks/whatsapp',
    metaCallbackUrlHint: 'Use full URL: https://<your-domain>/api/webhooks/whatsapp',
    supabaseProjectRef: ref,
    envPresent: {
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      META_WEBHOOK_VERIFY_TOKEN: !!process.env.META_WEBHOOK_VERIFY_TOKEN,
      WHATSAPP_WEBHOOK_VERIFY_TOKEN: !!process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
      WHATSAPP_PHONE_NUMBER_ID: !!process.env.WHATSAPP_PHONE_NUMBER_ID,
      WHATSAPP_ACCESS_TOKEN: !!process.env.WHATSAPP_ACCESS_TOKEN,
    },
    webhookDebugLogging: process.env.WHATSAPP_WEBHOOK_DEBUG === 'true',
    nextSteps: [
      'If SUPABASE_SERVICE_ROLE_KEY is false on Vercel, inbound messages cannot be inserted — set it to the service_role key from Supabase → Settings → API.',
      'In Meta → Webhooks, subscribe the WhatsApp app to field "messages" (not only message_templates).',
      'After sending a test message from a phone, open Vercel → Logs and search for [webhooks/whatsapp].',
      'Set WHATSAPP_WEBHOOK_DEBUG=true temporarily to log payload shape (no message bodies).',
    ],
  })
}
