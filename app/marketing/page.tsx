import { redirect } from 'next/navigation'

/**
 * Marketing root: redirect to Dashboard (overview).
 */
export default function MarketingPage() {
  redirect('/marketing/dashboard')
}
