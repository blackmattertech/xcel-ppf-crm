import { PDFDocument, StandardFonts, type PDFFont, type PDFPage, rgb } from 'pdf-lib'
import type { QuotationItem } from '@/backend/services/quotation.service'

type QuotationRow = {
  quote_number: string
  version: number
  items: QuotationItem[] | unknown
  subtotal: number
  discount: number
  gst: number
  total: number
  validity_date: string
  status: string
  created_at: string
  lead: { name: string; phone: string; email?: string | null }
  created_by_user?: { name: string; email?: string }
}

const PAGE_W = 595
const PAGE_H = 842
const MARGIN = 48
const CONTENT_W = PAGE_W - MARGIN * 2

/** Brand (matches quotations UI gradient anchor) */
const BRAND = rgb(222 / 255, 5 / 255, 16 / 255) // #de0510
const BRAND_DEEP = rgb(180 / 255, 4 / 255, 13 / 255)
const TEXT = rgb(0.12, 0.14, 0.16)
const TEXT_MUTED = rgb(0.38, 0.4, 0.44)
const WHITE = rgb(1, 1, 1)
const BG_CARD = rgb(0.97, 0.975, 0.98)
const BG_TO = rgb(0.93, 0.95, 0.99)
const TABLE_HEAD = rgb(0.94, 0.95, 0.97)
const TABLE_STRIPE = rgb(0.985, 0.988, 0.99)
const BORDER = rgb(0.86, 0.88, 0.91)
const TOTAL_BAR = rgb(0.96, 0.98, 0.96)

/** pdf-lib StandardFonts are WinAnsi */
function pdfSafe(s: string): string {
  return (s ?? '')
    .replace(/\r\n/g, '\n')
    .split('')
    .map((c) => {
      const code = c.charCodeAt(0)
      if (code === 9 || code === 10 || code === 13) return c
      if (code >= 32 && code <= 255) return c
      return ' '
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

function wrapToWidth(text: string, maxW: number, font: PDFFont, size: number): string[] {
  const t = pdfSafe(text)
  if (!t) return ['']
  const words = t.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (font.widthOfTextAtSize(next, size) <= maxW) cur = next
    else {
      if (cur) lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['']
}

function parseItems(raw: unknown): QuotationItem[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (x): x is QuotationItem =>
      x &&
      typeof x === 'object' &&
      typeof (x as QuotationItem).name === 'string' &&
      typeof (x as QuotationItem).quantity === 'number'
  )
}

function formatInr(n: number): string {
  return `Rs. ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDateLong(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return pdfSafe(String(iso))
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function quotationPdfFileName(quoteNumber: string): string {
  const base = pdfSafe(quoteNumber).replace(/[^\w.\-]+/g, '_') || 'Quotation'
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`
}

function drawTextRight(
  page: PDFPage,
  text: string,
  rightX: number,
  baselineY: number,
  size: number,
  font: PDFFont,
  color = TEXT
) {
  const w = font.widthOfTextAtSize(text, size)
  page.drawText(text, { x: rightX - w, y: baselineY, size, font, color })
}

export async function buildQuotationPdfBytes(quotation: QuotationRow): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

  let page = doc.addPage([PAGE_W, PAGE_H])
  const headerH = 88
  const headerBottom = PAGE_H - headerH

  // Top brand bar + accent strip
  page.drawRectangle({
    x: 0,
    y: headerBottom,
    width: PAGE_W,
    height: headerH,
    color: BRAND,
  })
  page.drawRectangle({
    x: 0,
    y: headerBottom,
    width: 6,
    height: headerH,
    color: BRAND_DEEP,
  })

  const quoteRight = pdfSafe(`${quotation.quote_number}  v${quotation.version}`)
  page.drawText('Ultrakool', {
    x: MARGIN,
    y: PAGE_H - 36,
    size: 22,
    font: fontBold,
    color: WHITE,
  })
  page.drawText('Professional Paint Protection Films', {
    x: MARGIN,
    y: PAGE_H - 54,
    size: 9,
    font,
    color: rgb(1, 0.92, 0.92),
  })
  page.drawText('QUOTATION', {
    x: MARGIN,
    y: PAGE_H - 72,
    size: 8,
    font: fontBold,
    color: rgb(1, 0.85, 0.85),
  })

  const quoteW = fontBold.widthOfTextAtSize(quoteRight, 16)
  const quoteX = PAGE_W - MARGIN - quoteW
  drawTextRight(page, quoteRight, PAGE_W - MARGIN, PAGE_H - 40, 16, fontBold, WHITE)
  page.drawText('Quote number', {
    x: quoteX,
    y: PAGE_H - 54,
    size: 7,
    font,
    color: rgb(0.95, 0.8, 0.8),
  })

  let y = headerBottom - 28

  const ensureSpace = (h: number, onNewPage?: () => void) => {
    if (y - h < MARGIN + 36) {
      page = doc.addPage([PAGE_W, PAGE_H])
      y = PAGE_H - MARGIN
      page.drawRectangle({
        x: MARGIN,
        y: y - 8,
        width: CONTENT_W,
        height: 1,
        color: BORDER,
      })
      y -= 20
      onNewPage?.()
    }
  }

  // Meta line
  const meta = `Issued ${formatDateLong(quotation.created_at)}   |   Valid until ${formatDateLong(quotation.validity_date)}   |   Status: ${pdfSafe(quotation.status)}`
  for (const line of wrapToWidth(meta, CONTENT_W, font, 8.5)) {
    ensureSpace(14)
    page.drawText(line, { x: MARGIN, y, size: 8.5, font, color: TEXT_MUTED })
    y -= 12
  }
  y -= 14

  // Two-column From / Bill to
  const colGap = 14
  const colW = (CONTENT_W - colGap) / 2
  const billToNameLines = wrapToWidth(pdfSafe(quotation.lead?.name || 'Customer'), colW - 24, fontBold, 10)
  const cardH = Math.max(
    108,
    52 + billToNameLines.length * 13 + 28 + (quotation.lead?.email ? 14 : 0)
  )

  ensureSpace(cardH + 8)

  page.drawRectangle({
    x: MARGIN,
    y: y - cardH,
    width: colW,
    height: cardH,
    color: BG_CARD,
    borderColor: BORDER,
    borderWidth: 0.5,
  })
  page.drawRectangle({
    x: MARGIN + colW + colGap,
    y: y - cardH,
    width: colW,
    height: cardH,
    color: BG_TO,
    borderColor: BORDER,
    borderWidth: 0.5,
  })

  let cy = y - 18
  page.drawText('FROM', {
    x: MARGIN + 12,
    y: cy,
    size: 7,
    font: fontBold,
    color: TEXT_MUTED,
  })
  cy -= 16
  page.drawText('Ultrakool', { x: MARGIN + 12, y: cy, size: 11, font: fontBold, color: TEXT })
  cy -= 13
  for (const t of ['info@ultrakool.com', '+91 1234567890', 'Your Company Address', 'GSTIN: 29ABCDE1234F1Z5']) {
    page.drawText(pdfSafe(t), { x: MARGIN + 12, y: cy, size: 8.5, font, color: TEXT_MUTED })
    cy -= 12
  }

  cy = y - 18
  page.drawText('BILL TO', {
    x: MARGIN + colW + colGap + 12,
    y: cy,
    size: 7,
    font: fontBold,
    color: TEXT_MUTED,
  })
  cy -= 16
  for (const line of billToNameLines) {
    page.drawText(line, {
      x: MARGIN + colW + colGap + 12,
      y: cy,
      size: 10,
      font: fontBold,
      color: TEXT,
    })
    cy -= 13
  }
  cy -= 2
  page.drawText(`Phone: ${pdfSafe(quotation.lead?.phone || '')}`, {
    x: MARGIN + colW + colGap + 12,
    y: cy,
    size: 8.5,
    font,
    color: TEXT_MUTED,
  })
  cy -= 12
  if (quotation.lead?.email) {
    page.drawText(`Email: ${pdfSafe(quotation.lead.email)}`, {
      x: MARGIN + colW + colGap + 12,
      y: cy,
      size: 8.5,
      font,
      color: TEXT_MUTED,
    })
  }

  y -= cardH + 28

  // Items table
  const items = parseItems(quotation.items)
  const colItem = MARGIN + 8
  const colDesc = MARGIN + 118
  const colQty = MARGIN + 268
  const colUnit = MARGIN + 318
  const colTot = PAGE_W - MARGIN - 8
  const rowH = 22
  const headH = 26

  const drawTableHeader = (pg: PDFPage, yy: number) => {
    pg.drawRectangle({
      x: MARGIN,
      y: yy - headH,
      width: CONTENT_W,
      height: headH,
      color: TABLE_HEAD,
      borderColor: BORDER,
      borderWidth: 0.75,
    })
    const hy = yy - 17
    pg.drawText('ITEM', { x: colItem, y: hy, size: 7, font: fontBold, color: TEXT_MUTED })
    pg.drawText('DESCRIPTION', { x: colDesc, y: hy, size: 7, font: fontBold, color: TEXT_MUTED })
    drawTextRight(pg, 'QTY', colQty + 28, hy, 7, fontBold, TEXT_MUTED)
    drawTextRight(pg, 'UNIT', colUnit + 52, hy, 7, fontBold, TEXT_MUTED)
    drawTextRight(pg, 'TOTAL', colTot, hy, 7, fontBold, TEXT_MUTED)
    return yy - headH
  }

  ensureSpace(headH + 24)
  page.drawText('Line items', {
    x: MARGIN,
    y,
    size: 11,
    font: fontBold,
    color: TEXT,
  })
  y -= 18
  y = drawTableHeader(page, y)

  const repeatTableHeader = () => {
    page.drawText('Line items (continued)', {
      x: MARGIN,
      y,
      size: 9,
      font: fontBold,
      color: TEXT_MUTED,
    })
    y -= 14
    y = drawTableHeader(page, y)
  }

  const drawRow = (idx: number, name: string, desc: string, qty: string, unit: string, tot: string) => {
    ensureSpace(rowH + 4, repeatTableHeader)
    const fill = idx % 2 === 0 ? TABLE_STRIPE : WHITE
    page.drawRectangle({
      x: MARGIN,
      y: y - rowH,
      width: CONTENT_W,
      height: rowH,
      color: fill,
      borderColor: BORDER,
      borderWidth: 0.35,
    })
    const midY = y - 15
    const nameLines = wrapToWidth(name, 100, font, 8.5)
    page.drawText(nameLines[0] ?? '', { x: colItem, y: midY, size: 8.5, font: fontBold, color: TEXT })
    const descLines = wrapToWidth(desc || '-', 138, font, 8)
    page.drawText(descLines[0] ?? '-', { x: colDesc, y: midY, size: 8, font, color: TEXT_MUTED })
    drawTextRight(page, qty, colQty + 28, midY, 8.5, font, TEXT)
    drawTextRight(page, unit, colUnit + 52, midY, 8.5, font, TEXT)
    drawTextRight(page, tot, colTot, midY, 8.5, fontBold, TEXT)
    y -= rowH
  }

  if (items.length === 0) {
    drawRow(0, '(No items)', '-', '-', '-', '-')
  } else {
    items.forEach((it, i) => {
      drawRow(
        i,
        pdfSafe(it.name),
        it.description ? pdfSafe(it.description) : '',
        String(it.quantity),
        formatInr(Number(it.unit_price)),
        formatInr(Number(it.total))
      )
    })
  }

  y -= 20

  // Totals box (right-aligned)
  const boxW = 220
  const boxX = PAGE_W - MARGIN - boxW
  const lineH = 16
  const rows = 4
  const boxH = rows * lineH + 28

  ensureSpace(boxH + 24)
  page.drawRectangle({
    x: boxX,
    y: y - boxH,
    width: boxW,
    height: boxH,
    color: TOTAL_BAR,
    borderColor: BORDER,
    borderWidth: 0.75,
  })

  let ty = y - 18
  const labelX = boxX + 12
  const valRight = boxX + boxW - 12

  const rowLabelVal = (label: string, value: string, bold = false) => {
    page.drawText(label, {
      x: labelX,
      y: ty,
      size: 9,
      font: bold ? fontBold : font,
      color: bold ? TEXT : TEXT_MUTED,
    })
    drawTextRight(page, value, valRight, ty, 9, bold ? fontBold : font, bold ? TEXT : TEXT_MUTED)
    ty -= lineH
  }

  rowLabelVal('Subtotal', formatInr(Number(quotation.subtotal)))
  const disc = Number(quotation.discount)
  rowLabelVal('Discount', disc > 0 ? `- ${formatInr(disc)}` : formatInr(0))
  rowLabelVal('GST', formatInr(Number(quotation.gst)))
  ty -= 4
  page.drawLine({
    start: { x: labelX, y: ty + 10 },
    end: { x: valRight, y: ty + 10 },
    thickness: 0.6,
    color: BORDER,
  })
  ty -= 6
  rowLabelVal('Amount payable', formatInr(Number(quotation.total)), true)

  y -= boxH + 28

  ensureSpace(52)
  page.drawText('Thank you for your business.', {
    x: MARGIN,
    y,
    size: 9,
    font: fontBold,
    color: BRAND,
  })
  y -= 14
  page.drawText('This quotation is valid until the date shown above. Prices are in INR.', {
    x: MARGIN,
    y,
    size: 8,
    font,
    color: TEXT_MUTED,
  })
  y -= 22
  if (quotation.created_by_user?.name) {
    page.drawText(`Prepared by: ${pdfSafe(quotation.created_by_user.name)}`, {
      x: MARGIN,
      y,
      size: 8,
      font,
      color: TEXT_MUTED,
    })
  }

  return doc.save()
}
