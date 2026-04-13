import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { getQuotationById } from '@/backend/services/quotation.service'
import {
  buildQuotationPdfBytes,
  quotationPdfFileName,
} from '@/backend/services/quotation-pdf.service'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authResult = await requireAuth(request)

    if ('error' in authResult) {
      return authResult.error
    }

    const quotation = (await getQuotationById(id)) as Parameters<typeof buildQuotationPdfBytes>[0]
    const pdfBytes = await buildQuotationPdfBytes(quotation)
    const fileName = quotationPdfFileName(quotation.quote_number)

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `attachment; filename="${fileName.replace(/"/g, '')}"`,
        'X-Quotation-File-Name': fileName,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate quotation PDF' },
      { status: 500 }
    )
  }
}
