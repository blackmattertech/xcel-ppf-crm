import { createServiceClient } from '@/lib/supabase/service'

export interface CompanyEnrichment {
  name?: string
  domain?: string
  industry?: string
  size?: string
  website?: string
  linkedin?: string
  description?: string
}

export interface PersonEnrichment {
  email?: string
  phone?: string
  name?: string
  jobTitle?: string
  company?: string
  linkedin?: string
  socialProfiles?: Array<{ platform: string; url: string }>
}

/**
 * Enrich company data (stub - requires enrichment API)
 * TODO: Integrate with Clearbit, Hunter.io, or similar
 */
export async function enrichCompanyData(
  domain: string | null,
  companyName?: string
): Promise<CompanyEnrichment | null> {
  if (!domain && !companyName) {
    return null
  }

  // Stub implementation
  // In production, this would integrate with:
  // - Clearbit Enrichment API
  // - Hunter.io Company API
  // - FullContact Company API

  console.log('Company enrichment requested:', { domain, companyName })

  // For now, return null (stub)
  // TODO: Implement actual company enrichment
  return null
}

/**
 * Enrich person/lead data (stub - requires enrichment API)
 */
export async function enrichPersonData(
  email: string | null,
  phone?: string,
  name?: string
): Promise<PersonEnrichment | null> {
  if (!email && !phone) {
    return null
  }

  // Stub implementation
  // In production, this would integrate with:
  // - Clearbit Person API
  // - Hunter.io Person API
  // - FullContact Person API

  console.log('Person enrichment requested:', { email, phone, name })

  // For now, return null (stub)
  // TODO: Implement actual person enrichment
  return null
}

/**
 * Enrich lead with external data
 */
export async function enrichLead(leadId: string): Promise<{
  company?: CompanyEnrichment | null
  person?: PersonEnrichment | null
}> {
  const supabase = createServiceClient()

  // Get lead
  const { data: lead, error } = await supabase
    .from('leads')
    .select('email, phone, name, meta_data')
    .eq('id', leadId)
    .single()

  if (error || !lead) {
    throw new Error('Lead not found')
  }

  // Extract domain from email
  const domain = lead.email ? lead.email.split('@')[1] : null

  // Enrich company data
  const company = await enrichCompanyData(domain)

  // Enrich person data
  const person = await enrichPersonData(lead.email, lead.phone, lead.name)

  // Update lead with enriched data if available
  if (company || person) {
    const updates: any = {}

    if (company) {
      if (company.industry) updates.industry = company.industry
      if (company.size) {
        // Store in meta_data
        updates.meta_data = {
          ...(lead.meta_data || {}),
          company_size: company.size,
          company_website: company.website,
          company_linkedin: company.linkedin,
        }
      }
    }

    if (person) {
      if (person.jobTitle) {
        updates.meta_data = {
          ...(updates.meta_data || lead.meta_data || {}),
          job_title: person.jobTitle,
          linkedin: person.linkedin,
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from('leads').update(updates).eq('id', leadId)
    }
  }

  return { company, person }
}
