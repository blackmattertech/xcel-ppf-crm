/**
 * Category heuristic for template content. Used for warnings only; not source of truth.
 */

import type { TemplateCategory } from '@/shared/whatsapp-template-types'

const PROMO_WORDS = [
  'discount',
  'offer',
  'sale',
  'promo',
  'coupon',
  'buy now',
  'upgrade now',
  'renew today',
]

const OTP_KEYWORDS = ['otp', 'verification', 'verification code', 'passcode', 'one-time', 'one time']

export interface CategoryHeuristicResult {
  recommendedCategory: TemplateCategory | null
  confidence: 'low' | 'medium' | 'high'
  reasons: string[]
}

/**
 * Analyze body text and current category; return recommendation and reasons (warnings only).
 */
export function classifyCategoryRisk(
  bodyText: string,
  currentCategory: TemplateCategory
): CategoryHeuristicResult {
  const reasons: string[] = []
  const lower = (bodyText || '').toLowerCase()

  // OTP/verification content outside AUTHENTICATION
  const hasOtpContent = OTP_KEYWORDS.some((k) => lower.includes(k))
  if (hasOtpContent && currentCategory !== 'AUTHENTICATION') {
    reasons.push('Content mentions OTP/verification; use AUTHENTICATION category for verification templates.')
    return {
      recommendedCategory: 'AUTHENTICATION',
      confidence: 'high',
      reasons,
    }
  }

  // Promotional language in UTILITY
  const hasPromo = PROMO_WORDS.some((w) => lower.includes(w))
  if (hasPromo && currentCategory === 'UTILITY') {
    reasons.push(
      'Template contains promotional language (e.g. discount, offer). Meta may re-categorize as MARKETING.'
    )
    return {
      recommendedCategory: 'MARKETING',
      confidence: 'medium',
      reasons,
    }
  }

  // Vague content (only variable or generic)
  const trimmed = bodyText.trim()
  if (/^\{\{\d+\}\}$/.test(trimmed) || /^congratulations?\.?$/i.test(trimmed)) {
    reasons.push('Content is vague or only a variable; Meta may treat as marketing or low quality.')
    return {
      recommendedCategory: null,
      confidence: 'low',
      reasons,
    }
  }

  return { recommendedCategory: null, confidence: 'low', reasons }
}
