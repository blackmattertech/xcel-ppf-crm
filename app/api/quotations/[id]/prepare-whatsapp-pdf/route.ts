import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { getQuotationById } from '@/backend/services/quotation.service'
import {
  buildQuotationPdfBytes,
  quotationPdfFileName,
} from '@/backend/services/quotation-pdf.service'
import { createServiceClient } from '@/lib/supabase/service'
import {
  ensureTemplateMediaBucket,
  TEMPLATE_MEDIA_BUCKET,
} from '@/lib/supabase/ensure-template-media-bucket'

/**
 * One server round-trip: generate quotation PDF + upload to public storage for WhatsApp document send.
 * Avoids client signed-upload (fails if bucket missing) and reduces total latency vs GET pdf + signed-url + PUT.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authResult = await requireAuth(req)
    if ('error' in authResult) {
      return authResult.error
    }

    const supabase = createServiceClient()
    const ensured = await ensureTemplateMediaBucket(supabase)
    if (!ensured.ok) {
      return NextResponse.json(
        {
          error:
            ensured.error ||
            'WhatsApp media storage is not ready. Check SUPABASE_SERVICE_ROLE_KEY and storage permissions.',
        },
        { status: 503 }
      )
    }

    const quotation = (await getQuotationById(id)) as Parameters<typeof buildQuotationPdfBytes>[0]
    const pdfBytes = await buildQuotationPdfBytes(quotation)
    const buffer = Buffer.from(pdfBytes)
    const fileName = quotationPdfFileName(quotation.quote_number)
    const path = `${authResult.user.id}/inbox-quotation/${id}/${crypto.randomUUID()}.pdf`

    const { error: upErr } = await supabase.storage.from(TEMPLATE_MEDIA_BUCKET).upload(path, buffer, {
      contentType: 'application/pdf',
      upsert: false,
    })

    if (upErr) {
      return NextResponse.json(
        { error: upErr.message || 'Failed to upload quotation PDF' },
        { status: 500 }
      )
    }

    const { data: pub } = supabase.storage.from(TEMPLATE_MEDIA_BUCKET).getPublicUrl(path)
    const publicUrl = pub?.publicUrl
    if (!publicUrl) {
      return NextResponse.json({ error: 'Failed to resolve public URL for PDF' }, { status: 500 })
    }

    return NextResponse.json({
      url: publicUrl,
      fileName,
      mimeType: 'application/pdf',
      sizeBytes: buffer.byteLength,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to prepare quotation PDF'
    const status = message.toLowerCase().includes('not found') ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
