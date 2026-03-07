import { redirect } from 'next/navigation'

/**
 * Marketing root: redirect to Bulk WhatsApp so the layout's tabs are the only nav.
 * Avoids duplicate tab rows (layout tabs + page tabs).
 */
export default function MarketingPage() {
  redirect('/marketing/bulk-whatsapp')
}
