import { redirect } from 'next/navigation'

/**
 * Marketing root: redirect to Dashboard (overview). Layout tabs: Dashboard | WhatsApp.
 */
export default function MarketingPage() {
  redirect('/marketing/dashboard')
}
