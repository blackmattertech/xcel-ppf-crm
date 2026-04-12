import { notFound } from 'next/navigation'

/** Internal target for proxy rewrite when WhatsApp UI routes are disabled. */
export default function WhatsAppUiDisabledPage() {
  notFound()
}
