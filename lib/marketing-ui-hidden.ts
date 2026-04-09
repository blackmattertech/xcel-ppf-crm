import { notFound } from 'next/navigation'

/**
 * Marketing WhatsApp UI is hidden from the nav; direct URL access should 404.
 * Page modules and API routes stay in the repo — only segment layouts import this.
 * To re-expose: remove the layout.tsx files under app/marketing/{whatsapp,templates,bulk-whatsapp,chat}
 * and restore the WhatsApp child in shared/constants/sidebar.ts.
 */
export function marketingWhatsAppUiNotFound(): never {
  notFound()
}
