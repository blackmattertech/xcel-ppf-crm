import { createServiceClient } from '@/lib/supabase/service'
import { Database } from '@/shared/types/database'

type Lead = Database['public']['Tables']['leads']['Row']
type LeadInsert = Database['public']['Tables']['leads']['Insert']

export interface DuplicateCandidate {
  leadId: string
  lead: Lead
  matchScore: number
  matchReasons: string[]
}

export interface DuplicateMatch {
  lead1: Lead
  lead2: Lead
  matchScore: number
  matchReasons: string[]
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length
  const len2 = str2.length
  const matrix: number[][] = []

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // deletion
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + 1 // substitution
        )
      }
    }
  }

  return matrix[len1][len2]
}

/**
 * Calculate similarity score between two strings (0-1)
 */
function stringSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0
  const maxLen = Math.max(str1.length, str2.length)
  if (maxLen === 0) return 1
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase())
  return 1 - distance / maxLen
}

/**
 * Normalize phone number for comparison
 */
function normalizePhone(phone: string): string {
  if (!phone) return ''
  // Remove all non-digit characters
  return phone.replace(/\D/g, '')
}

/**
 * Check if two phone numbers match (with fuzzy matching)
 */
function phoneMatch(phone1: string | null, phone2: string | null): { match: boolean; score: number } {
  if (!phone1 || !phone2) return { match: false, score: 0 }

  const normalized1 = normalizePhone(phone1)
  const normalized2 = normalizePhone(phone2)

  // Exact match
  if (normalized1 === normalized2) {
    return { match: true, score: 1.0 }
  }

  // Check if one is a substring of the other (handles country code differences)
  if (normalized1.length >= 10 && normalized2.length >= 10) {
    const last10_1 = normalized1.slice(-10)
    const last10_2 = normalized2.slice(-10)
    if (last10_1 === last10_2) {
      return { match: true, score: 0.9 }
    }
  }

  // Fuzzy match for similar numbers
  const similarity = stringSimilarity(normalized1, normalized2)
  return { match: similarity >= 0.85, score: similarity }
}

/**
 * Normalize email for comparison
 */
function normalizeEmail(email: string | null): string {
  if (!email) return ''
  return email.toLowerCase().trim()
}

/**
 * Check if two emails match
 */
function emailMatch(email1: string | null, email2: string | null): boolean {
  if (!email1 || !email2) return false
  return normalizeEmail(email1) === normalizeEmail(email2)
}

/**
 * Find duplicate candidates for a lead
 */
export async function findDuplicateCandidates(
  leadData: LeadInsert,
  excludeLeadId?: string
): Promise<DuplicateCandidate[]> {
  const supabase = createServiceClient()
  const candidates: DuplicateCandidate[] = []

  if (!leadData.phone && !leadData.email && !leadData.name) {
    return candidates
  }

  // Build query to find potential duplicates
  let query = supabase.from('leads').select('*')

  // If we have a phone, search by phone first (most reliable)
  if (leadData.phone) {
    const normalizedPhone = normalizePhone(leadData.phone)
    
    // Get all leads with similar phone numbers
    const { data: phoneLeads } = await supabase
      .from('leads')
      .select('*')
      .not('phone', 'is', null)

    if (phoneLeads) {
      for (const lead of phoneLeads) {
        if (excludeLeadId && lead.id === excludeLeadId) continue

        const phoneMatchResult = phoneMatch(leadData.phone, lead.phone)
        if (phoneMatchResult.match) {
          const matchReasons: string[] = []
          let matchScore = phoneMatchResult.score

          // Check name similarity
          if (leadData.name && lead.name) {
            const nameSimilarity = stringSimilarity(leadData.name, lead.name)
            if (nameSimilarity > 0.7) {
              matchReasons.push(`Name similarity: ${Math.round(nameSimilarity * 100)}%`)
              matchScore = (matchScore + nameSimilarity) / 2
            }
          }

          // Check email match
          if (emailMatch(leadData.email, lead.email)) {
            matchReasons.push('Exact email match')
            matchScore = Math.min(1.0, matchScore + 0.2)
          }

          matchReasons.push(`Phone match: ${Math.round(phoneMatchResult.score * 100)}%`)

          candidates.push({
            leadId: lead.id,
            lead: lead as Lead,
            matchScore,
            matchReasons,
          })
        }
      }
    }
  }

  // If we have an email, also search by email
  if (leadData.email) {
    const { data: emailLeads } = await supabase
      .from('leads')
      .select('*')
      .eq('email', normalizeEmail(leadData.email))

    if (emailLeads) {
      for (const lead of emailLeads) {
        if (excludeLeadId && lead.id === excludeLeadId) continue

        // Check if already in candidates
        const existing = candidates.find((c) => c.leadId === lead.id)
        if (existing) {
          if (!existing.matchReasons.includes('Exact email match')) {
            existing.matchReasons.push('Exact email match')
            existing.matchScore = Math.min(1.0, existing.matchScore + 0.2)
          }
          continue
        }

        const matchReasons: string[] = ['Exact email match']
        let matchScore = 0.9

        // Check name similarity
        if (leadData.name && lead.name) {
          const nameSimilarity = stringSimilarity(leadData.name, lead.name)
          if (nameSimilarity > 0.7) {
            matchReasons.push(`Name similarity: ${Math.round(nameSimilarity * 100)}%`)
            matchScore = (matchScore + nameSimilarity) / 2
          }
        }

        // Check phone match
        if (leadData.phone && lead.phone) {
          const phoneMatchResult = phoneMatch(leadData.phone, lead.phone)
          if (phoneMatchResult.match) {
            matchReasons.push(`Phone match: ${Math.round(phoneMatchResult.score * 100)}%`)
            matchScore = Math.min(1.0, matchScore + phoneMatchResult.score)
          }
        }

        candidates.push({
          leadId: lead.id,
          lead: lead as Lead,
          matchScore,
          matchReasons,
        })
      }
    }
  }

  // If we have a name, do fuzzy name matching (only if no strong matches found)
  if (leadData.name && candidates.length === 0) {
    const { data: nameLeads } = await supabase
      .from('leads')
      .select('*')
      .not('name', 'is', null)
      .limit(100) // Limit to avoid performance issues

    if (nameLeads) {
      for (const lead of nameLeads) {
        if (excludeLeadId && lead.id === excludeLeadId) continue

        const nameSimilarity = stringSimilarity(leadData.name, lead.name)
        if (nameSimilarity > 0.85) {
          // High name similarity threshold
          candidates.push({
            leadId: lead.id,
            lead: lead as Lead,
            matchScore: nameSimilarity,
            matchReasons: [`Name similarity: ${Math.round(nameSimilarity * 100)}%`],
          })
        }
      }
    }
  }

  // Sort by match score (highest first) and remove duplicates
  const uniqueCandidates = new Map<string, DuplicateCandidate>()
  for (const candidate of candidates) {
    const existing = uniqueCandidates.get(candidate.leadId)
    if (!existing || candidate.matchScore > existing.matchScore) {
      uniqueCandidates.set(candidate.leadId, candidate)
    }
  }

  return Array.from(uniqueCandidates.values())
    .sort((a, b) => b.matchScore - a.matchScore)
    .filter((c) => c.matchScore >= 0.7) // Only return high-confidence matches
}

/**
 * Check if a lead is a duplicate before creation
 */
export async function checkForDuplicatesBeforeCreate(
  leadData: LeadInsert
): Promise<{ isDuplicate: boolean; duplicateLead?: Lead; matchScore?: number }> {
  const candidates = await findDuplicateCandidates(leadData)

  if (candidates.length === 0) {
    return { isDuplicate: false }
  }

  // Return the highest scoring candidate
  const bestMatch = candidates[0]
  return {
    isDuplicate: true,
    duplicateLead: bestMatch.lead,
    matchScore: bestMatch.matchScore,
  }
}

/**
 * Merge two duplicate leads
 */
export async function mergeDuplicateLeads(
  masterLeadId: string,
  duplicateLeadId: string,
  mergedBy: string
): Promise<Lead> {
  const supabase = createServiceClient()

  // Get both leads
  const { data: masterLead, error: masterError } = await supabase
    .from('leads')
    .select('*')
    .eq('id', masterLeadId)
    .single()

  if (masterError || !masterLead) {
    throw new Error('Master lead not found')
  }

  const { data: duplicateLead, error: duplicateError } = await supabase
    .from('leads')
    .select('*')
    .eq('id', duplicateLeadId)
    .single()

  if (duplicateError || !duplicateLead) {
    throw new Error('Duplicate lead not found')
  }

  // Merge strategy: Keep master lead data, but fill in missing fields from duplicate
  const mergedData: any = {
    ...masterLead,
    updated_at: new Date().toISOString(),
  }

  // Fill in missing fields from duplicate
  if (!mergedData.email && duplicateLead.email) {
    mergedData.email = duplicateLead.email
  }

  if (!mergedData.requirement && duplicateLead.requirement) {
    mergedData.requirement = duplicateLead.requirement
  }

  if (!mergedData.budget_range && duplicateLead.budget_range) {
    mergedData.budget_range = duplicateLead.budget_range
  }

  if (!mergedData.timeline && duplicateLead.timeline) {
    mergedData.timeline = duplicateLead.timeline
  }

  // Merge meta_data if both exist
  if (duplicateLead.meta_data && masterLead.meta_data) {
    mergedData.meta_data = {
      ...duplicateLead.meta_data,
      ...masterLead.meta_data,
      _merged_from: duplicateLeadId,
      _merged_at: new Date().toISOString(),
      _merged_by: mergedBy,
    }
  } else if (duplicateLead.meta_data) {
    mergedData.meta_data = {
      ...duplicateLead.meta_data,
      _merged_from: duplicateLeadId,
      _merged_at: new Date().toISOString(),
      _merged_by: mergedBy,
    }
  }

  // Update master lead with merged data
  const { data: updatedLead, error: updateError } = await supabase
    .from('leads')
    .update(mergedData)
    .eq('id', masterLeadId)
    .select()
    .single()

  if (updateError) {
    throw new Error(`Failed to merge leads: ${updateError.message}`)
  }

  // Transfer related records to master lead
  // Transfer calls
  await supabase
    .from('calls')
    .update({ lead_id: masterLeadId })
    .eq('lead_id', duplicateLeadId)

  // Transfer follow-ups
  await supabase
    .from('follow_ups')
    .update({ lead_id: masterLeadId })
    .eq('lead_id', duplicateLeadId)

  // Transfer quotations
  await supabase
    .from('quotations')
    .update({ lead_id: masterLeadId })
    .eq('lead_id', duplicateLeadId)

  // Transfer status history
  await supabase
    .from('lead_status_history')
    .update({ lead_id: masterLeadId })
    .eq('lead_id', duplicateLeadId)

  // Transfer SLA violations
  await supabase
    .from('sla_violations')
    .update({ lead_id: masterLeadId })
    .eq('lead_id', duplicateLeadId)

  // Create merge record in status history
  await supabase.from('lead_status_history').insert({
    lead_id: masterLeadId,
    old_status: masterLead.status,
    new_status: masterLead.status, // Status doesn't change
    changed_by: mergedBy,
    notes: `Merged with duplicate lead ${duplicateLead.lead_id || duplicateLead.id}`,
  } as any)

  // Delete duplicate lead
  await supabase.from('leads').delete().eq('id', duplicateLeadId)

  return updatedLead as Lead
}

/**
 * Get all duplicate pairs in the system
 */
export async function getAllDuplicatePairs(threshold: number = 0.7): Promise<DuplicateMatch[]> {
  const supabase = createServiceClient()
  const matches: DuplicateMatch[] = []

  // Get all leads
  const { data: leads, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })

  if (error || !leads) {
    throw new Error('Failed to fetch leads for duplicate detection')
  }

  // Compare each lead with every other lead (optimized)
  const processed = new Set<string>()

  for (let i = 0; i < leads.length; i++) {
    const lead1 = leads[i] as Lead

    for (let j = i + 1; j < leads.length; j++) {
      const lead2 = leads[j] as Lead

      const pairKey = [lead1.id, lead2.id].sort().join('-')
      if (processed.has(pairKey)) continue
      processed.add(pairKey)

      const matchReasons: string[] = []
      let matchScore = 0

      // Check phone match
      if (lead1.phone && lead2.phone) {
        const phoneMatchResult = phoneMatch(lead1.phone, lead2.phone)
        if (phoneMatchResult.match) {
          matchReasons.push(`Phone match: ${Math.round(phoneMatchResult.score * 100)}%`)
          matchScore = Math.max(matchScore, phoneMatchResult.score)
        }
      }

      // Check email match
      if (emailMatch(lead1.email, lead2.email)) {
        matchReasons.push('Exact email match')
        matchScore = Math.max(matchScore, 0.9)
      }

      // Check name similarity
      if (lead1.name && lead2.name) {
        const nameSimilarity = stringSimilarity(lead1.name, lead2.name)
        if (nameSimilarity > 0.7) {
          matchReasons.push(`Name similarity: ${Math.round(nameSimilarity * 100)}%`)
          matchScore = (matchScore + nameSimilarity) / 2
        }
      }

      if (matchScore >= threshold && matchReasons.length > 0) {
        matches.push({
          lead1,
          lead2,
          matchScore,
          matchReasons,
        })
      }
    }
  }

  return matches.sort((a, b) => b.matchScore - a.matchScore)
}
