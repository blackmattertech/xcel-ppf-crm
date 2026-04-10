'use client'

import { useParams, useRouter, useSearchParams } from 'next/navigation'
import LeadDetailPageContent from '../LeadDetailPageContent'

export default function LeadDetailPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const leadId = params.id as string

  function goBackToLeads() {
    const fromPage =
      searchParams.get('fromPage') ??
      (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('fromPage') : null)
    if (fromPage) router.push(`/leads?page=${fromPage}`)
    else router.back()
  }

  return <LeadDetailPageContent leadId={leadId} onClose={goBackToLeads} />
}
