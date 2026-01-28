import { createServiceClient } from '@/lib/supabase/service'

export interface EnrichmentResult {
  phone?: {
    original: string
    normalized: string
    formatted: string
    isValid: boolean
    countryCode?: string
  }
  email?: {
    original: string
    normalized: string
    isValid: boolean
    isDisposable?: boolean
    domain?: string
  }
  company?: {
    name?: string
    industry?: string
    size?: string
    website?: string
  }
}

/**
 * Normalize phone number to standard format
 */
export function normalizePhoneNumber(phone: string): {
  normalized: string
  formatted: string
  countryCode: string | null
  isValid: boolean
} {
  if (!phone) {
    return {
      normalized: '',
      formatted: '',
      countryCode: null,
      isValid: false,
    }
  }

  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '')

  if (digits.length === 0) {
    return {
      normalized: '',
      formatted: phone,
      countryCode: null,
      isValid: false,
    }
  }

  // Detect Indian phone numbers (starts with +91 or 91 or 0)
  let countryCode: string | null = null
  let normalized = digits

  if (digits.startsWith('91') && digits.length >= 12) {
    // Already has country code
    countryCode = '91'
    normalized = digits
  } else if (digits.startsWith('0') && digits.length === 11) {
    // Indian number starting with 0
    countryCode = '91'
    normalized = '91' + digits.substring(1)
  } else if (digits.length === 10) {
    // Assume Indian number without country code
    countryCode = '91'
    normalized = '91' + digits
  } else if (digits.length >= 10) {
    // Valid length, keep as is
    countryCode = digits.length > 10 ? digits.substring(0, digits.length - 10) : null
    normalized = digits
  }

  // Format for display (Indian format: +91 XXXXX XXXXX)
  let formatted = phone
  if (normalized.length >= 12 && normalized.startsWith('91')) {
    const mobileNumber = normalized.substring(2)
    if (mobileNumber.length === 10) {
      formatted = `+91 ${mobileNumber.substring(0, 5)} ${mobileNumber.substring(5)}`
    }
  } else if (normalized.length === 10) {
    formatted = `${normalized.substring(0, 5)} ${normalized.substring(5)}`
  }

  // Basic validation: should be 10-15 digits
  const isValid = normalized.length >= 10 && normalized.length <= 15

  return {
    normalized,
    formatted,
    countryCode,
    isValid,
  }
}

/**
 * Validate email format and check for disposable domains
 */
export function validateEmail(email: string): {
  normalized: string
  isValid: boolean
  isDisposable: boolean
  domain: string | null
} {
  if (!email) {
    return {
      normalized: '',
      isValid: false,
      isDisposable: false,
      domain: null,
    }
  }

  const normalized = email.toLowerCase().trim()

  // Basic email regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const isValid = emailRegex.test(normalized)

  if (!isValid) {
    return {
      normalized,
      isValid: false,
      isDisposable: false,
      domain: null,
    }
  }

  // Extract domain
  const domain = normalized.split('@')[1] || null

  // List of common disposable email domains
  const disposableDomains = [
    'tempmail.com',
    'guerrillamail.com',
    'mailinator.com',
    '10minutemail.com',
    'throwaway.email',
    'temp-mail.org',
    'getnada.com',
    'mohmal.com',
    'fakeinbox.com',
    'trashmail.com',
    'maildrop.cc',
    'yopmail.com',
    'sharklasers.com',
    'grr.la',
    'guerrillamailblock.com',
  ]

  const isDisposable = domain ? disposableDomains.some((d) => domain.includes(d)) : false

  return {
    normalized,
    isValid,
    isDisposable,
    domain,
  }
}

/**
 * Enrich lead data with validation and normalization
 */
export async function enrichLeadData(data: {
  phone?: string | null
  email?: string | null
  name?: string | null
}): Promise<EnrichmentResult> {
  const result: EnrichmentResult = {}

  // Enrich phone
  if (data.phone) {
    const phoneResult = normalizePhoneNumber(data.phone)
    result.phone = {
      original: data.phone,
      normalized: phoneResult.normalized,
      formatted: phoneResult.formatted,
      isValid: phoneResult.isValid,
      countryCode: phoneResult.countryCode || undefined,
    }
  }

  // Enrich email
  if (data.email) {
    const emailResult = validateEmail(data.email)
    result.email = {
      original: data.email,
      normalized: emailResult.normalized,
      isValid: emailResult.isValid,
      isDisposable: emailResult.isDisposable,
      domain: emailResult.domain || undefined,
    }
  }

  // Company enrichment would go here (requires external API)
  // For now, we'll skip it as it requires API keys

  return result
}

/**
 * Clean and normalize lead data before saving
 */
export async function cleanLeadData(data: {
  name?: string | null
  phone?: string | null
  email?: string | null
  [key: string]: any
}): Promise<{
  cleaned: any
  enrichment: EnrichmentResult
  warnings: string[]
}> {
  const warnings: string[] = []
  const cleaned: any = { ...data }
  const enrichment = await enrichLeadData({
    phone: data.phone,
    email: data.email,
    name: data.name,
  })

  // Clean name
  if (data.name) {
    cleaned.name = data.name.trim().replace(/\s+/g, ' ')
    if (cleaned.name.length < 2) {
      warnings.push('Name is too short')
    }
  }

  // Clean and normalize phone
  if (data.phone && enrichment.phone) {
    if (!enrichment.phone.isValid) {
      warnings.push('Phone number appears to be invalid')
    } else {
      // Use normalized phone for storage
      cleaned.phone = enrichment.phone.normalized || data.phone
    }
  }

  // Clean and normalize email
  if (data.email && enrichment.email) {
    if (!enrichment.email.isValid) {
      warnings.push('Email address appears to be invalid')
    } else if (enrichment.email.isDisposable) {
      warnings.push('Email appears to be from a disposable email service')
    } else {
      // Use normalized email for storage
      cleaned.email = enrichment.email.normalized || data.email
    }
  }

  return {
    cleaned,
    enrichment,
    warnings,
  }
}

/**
 * Batch enrich multiple leads
 */
export async function batchEnrichLeads(
  leads: Array<{ phone?: string | null; email?: string | null; name?: string | null }>
): Promise<Array<{ enrichment: EnrichmentResult; warnings: string[] }>> {
  const results = []

  for (const lead of leads) {
    const enrichment = await enrichLeadData(lead)
    const warnings: string[] = []

    if (lead.phone && enrichment.phone && !enrichment.phone.isValid) {
      warnings.push('Invalid phone number')
    }

    if (lead.email && enrichment.email) {
      if (!enrichment.email.isValid) {
        warnings.push('Invalid email address')
      }
      if (enrichment.email.isDisposable) {
        warnings.push('Disposable email detected')
      }
    }

    results.push({ enrichment, warnings })
  }

  return results
}

/**
 * Validate lead data before creation/update
 */
export async function validateLeadData(data: {
  name?: string | null
  phone?: string | null
  email?: string | null
}): Promise<{
  isValid: boolean
  errors: string[]
  warnings: string[]
  enrichment: EnrichmentResult
}> {
  const errors: string[] = []
  const warnings: string[] = []

  // Name validation
  if (data.name) {
    const trimmedName = data.name.trim()
    if (trimmedName.length < 2) {
      errors.push('Name must be at least 2 characters')
    }
    if (trimmedName.length > 100) {
      errors.push('Name must be less than 100 characters')
    }
  }

  // Phone validation
  if (data.phone) {
    const phoneResult = normalizePhoneNumber(data.phone)
    if (!phoneResult.isValid) {
      errors.push('Phone number is invalid')
    }
  } else {
    errors.push('Phone number is required')
  }

  // Email validation (optional but validate if provided)
  if (data.email) {
    const emailResult = validateEmail(data.email)
    if (!emailResult.isValid) {
      errors.push('Email address is invalid')
    }
    if (emailResult.isDisposable) {
      warnings.push('Email appears to be from a disposable email service')
    }
  }

  const enrichment = await enrichLeadData(data)

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    enrichment,
  }
}
