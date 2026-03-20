/**
 * Template validation: name, parameters, examples, subtype-specific rules.
 * Returns { errors: string[], warnings: string[] }. Errors block submit; warnings do not.
 */

import type {
  BodyComponent,
  NormalizedTemplate,
  TemplateCategory,
  TemplateVariable,
} from '@/shared/whatsapp-template-types'
import { classifyCategoryRisk } from './whatsapp-template-category-heuristic.service'

const NAME_REGEX = /^[a-z0-9_]+$/
const NAMED_PARAM_REGEX = /\{\{([a-z_][a-z0-9_]*)\}\}/g
const POSITIONAL_PARAM_REGEX = /\{\{(\d+)\}\}/g

export interface ValidationResult {
  errors: string[]
  warnings: string[]
}

export function validateTemplateName(name: string): string | null {
  if (!name || typeof name !== 'string') return 'Template name is required'
  const trimmed = name.trim()
  if (trimmed.length > 512) return 'Template name must be at most 512 characters'
  if (!NAME_REGEX.test(trimmed)) return 'Template name must contain only lowercase letters, numbers, and underscores'
  return null
}

/** Extract named variables {{param_name}} from text. */
export function extractNamedVariables(text: string): string[] {
  const names: string[] = []
  let m: RegExpExecArray | null
  const re = new RegExp(NAMED_PARAM_REGEX.source, 'g')
  while ((m = re.exec(text)) !== null) {
    if (!names.includes(m[1])) names.push(m[1])
  }
  return names
}

/** Extract positional indices {{1}}, {{2}} from text. */
export function extractPositionalIndices(text: string): number[] {
  const indices = new Set<number>()
  let m: RegExpExecArray | null
  const re = new RegExp(POSITIONAL_PARAM_REGEX.source, 'g')
  while ((m = re.exec(text)) !== null) {
    indices.add(parseInt(m[1], 10))
  }
  return [...indices].sort((a, b) => a - b)
}

/** Validate contiguous positional (1,2,3...) and no gaps. */
export function validatePositionalContiguous(indices: number[]): string | null {
  if (indices.length === 0) return null
  const max = Math.max(...indices)
  for (let i = 1; i <= max; i++) {
    if (!indices.includes(i)) {
      return `Positional parameters must be contiguous ({{1}}, {{2}}, ...). Missing {{${i}}}.`
    }
  }
  return null
}

/** Validate named param names: lowercase letters and underscores only. */
export function validateNamedParamNames(names: string[]): string | null {
  for (const n of names) {
    if (!/^[a-z_][a-z0-9_]*$/.test(n)) {
      return `Parameter name "${n}" must be lowercase letters and underscores only.`
    }
  }
  const seen = new Set<string>()
  for (const n of names) {
    if (seen.has(n)) return `Duplicate parameter name: ${n}`
    seen.add(n)
  }
  return null
}

/** Require examples for every variable in body/header. */
export function validateExamplesForVariables(
  text: string,
  variables: TemplateVariable[],
  label: string
): string[] {
  const errs: string[] = []
  if (variables.length === 0) return errs
  for (let i = 0; i < variables.length; i++) {
    const v = variables[i]
    const ex = 'example' in v ? (v as { example?: string }).example : undefined
    if (ex === undefined || (typeof ex === 'string' && !ex.trim())) {
      const name = v.kind === 'named' ? (v as { name: string }).name : `{{${(v as { index: number }).index}}}`
      errs.push(`${label}: example required for parameter ${name}`)
    }
  }
  return errs
}

// ---------- Subtype validators ----------

function validateStandard(template: NormalizedTemplate): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  const bodyComp = template.components.find((c): c is { type: 'BODY'; text?: string } => c.type === 'BODY')
  const bodyText = bodyComp?.text ?? ''
  if (!bodyText.trim()) errors.push('Body is required.')
  if (bodyText.length > 1024) errors.push('Body must be at most 1024 characters.')

  const footerComp = template.components.find((c): c is { type: 'FOOTER'; text?: string } => c.type === 'FOOTER')
  if (footerComp?.text && footerComp.text.length > 60) {
    errors.push('Footer must be at most 60 characters.')
  }

  const headerComp = template.components.find((c) => c.type === 'HEADER') as { type: 'HEADER'; format?: string; headerHandle?: string } | undefined
  if (headerComp && headerComp.format !== 'TEXT' && !headerComp.headerHandle) {
    errors.push('Media header requires example.header_handle.')
  }

  const buttonsComp = template.components.find((c) => c.type === 'BUTTONS') as { type: 'BUTTONS'; buttons: Array<{ type: string; text?: string }> } | undefined
  if (buttonsComp && buttonsComp.buttons.length > 10) {
    errors.push('At most 10 buttons allowed.')
  }

  const categoryRisk = classifyCategoryRisk(bodyText, template.category)
  if (categoryRisk.reasons.length) warnings.push(...categoryRisk.reasons)

  return { errors, warnings }
}

function validateAuthRestrictions(template: NormalizedTemplate): ValidationResult {
  const errors: string[] = []
  const bodyComp = template.components.find((c): c is { type: 'BODY'; text?: string } => c.type === 'BODY')
  const bodyText = (bodyComp?.text ?? '').toLowerCase()
  if (bodyText.includes('http') || /https?:\/\//.test(bodyText)) errors.push('Authentication templates must not contain URLs.')
  if (/\p{Emoji}/u.test(bodyComp?.text ?? '')) errors.push('Authentication templates must not contain emojis.')
  const hasMedia = template.components.some(
    (c) => c.type === 'HEADER' && (c as { format: string }).format !== 'TEXT'
  )
  if (hasMedia) errors.push('Authentication templates must not use media headers.')
  const footerComp = template.components.find((c): c is { type: 'FOOTER'; codeExpirationMinutes?: number } => c.type === 'FOOTER')
  if (footerComp?.codeExpirationMinutes != null) {
    if (footerComp.codeExpirationMinutes < 1 || footerComp.codeExpirationMinutes > 90) {
      errors.push('code_expiration_minutes must be between 1 and 90.')
    }
  }
  return { errors, warnings: [] }
}

function validateCallPermissionRequest(template: NormalizedTemplate): ValidationResult {
  const errors: string[] = []
  const bodyComp = template.components.find((c): c is { type: 'BODY' } => c.type === 'BODY')
  if (!bodyComp || !(bodyComp as { text?: string }).text?.trim()) {
    errors.push('BODY component is required for call permission request.')
  }
  const hasCallPermission = template.components.some(
    (c) => (c as { type: string }).type === 'call_permission_request'
  )
  if (!hasCallPermission) {
    errors.push('call_permission_request component is required.')
  }
  if (template.category !== 'UTILITY' && template.category !== 'MARKETING') {
    errors.push('CALL_PERMISSION_REQUEST allows only UTILITY or MARKETING category.')
  }
  return { errors, warnings: [] }
}

function validateCatalog(template: NormalizedTemplate): ValidationResult {
  const errors: string[] = []
  const bodyComp = template.components.find((c): c is { type: 'BODY' } => c.type === 'BODY')
  if (!bodyComp || !(bodyComp as { text?: string }).text?.trim()) {
    errors.push('BODY component is required for catalog template.')
  }
  const buttonsComp = template.components.find((c) => c.type === 'BUTTONS') as { type: 'BUTTONS'; buttons: Array<{ type: string }> } | undefined
  const hasCatalogButton = buttonsComp?.buttons?.some((b: { type: string }) => b.type === 'CATALOG')
  if (!hasCatalogButton) {
    errors.push('CATALOG template requires a BUTTONS component with type CATALOG.')
  }
  if (template.category !== 'MARKETING') {
    errors.push('CATALOG is a MARKETING template.')
  }
  return { errors, warnings: [] }
}

function validateLimitedTimeOffer(template: NormalizedTemplate): ValidationResult {
  const errors: string[] = []
  const bodyComp = template.components.find((c): c is { type: 'BODY'; text?: string } => c.type === 'BODY')
  const bodyText = bodyComp?.text ?? ''
  if (!bodyText.trim()) errors.push('BODY is required.')
  if (bodyText.length > 600) errors.push('Body must be at most 600 characters for limited time offer.')

  const ltoComp = template.components.find(
    (c): c is { type: 'limited_time_offer'; text: string } => (c as { type: string }).type === 'limited_time_offer'
  )
  if (ltoComp && ltoComp.text.length > 16) {
    errors.push('limited_time_offer.text must be at most 16 characters.')
  }

  const footerComp = template.components.find((c): c is { type: 'FOOTER' } => c.type === 'FOOTER')
  if (footerComp) {
    errors.push('Footer is not supported for LIMITED_TIME_OFFER.')
  }

  const buttonsComp = template.components.find((c) => c.type === 'BUTTONS') as { type: 'BUTTONS'; buttons: Array<{ type: string; example?: string; url?: string; text?: string }> } | undefined
  if (buttonsComp?.buttons) {
    for (const b of buttonsComp.buttons) {
      if (b.type === 'COPY_CODE' && (b as { example?: string }).example && (b as { example: string }).example.length > 15) {
        errors.push('Copy code example must be at most 15 characters.')
      }
      if (b.type === 'URL' && (b as { url?: string }).url && (b as { url: string }).url.length > 2000) {
        errors.push('URL must be at most 2000 characters.')
      }
    }
  }

  return { errors, warnings: [] }
}

function validateProductCardCarousel(template: NormalizedTemplate): ValidationResult {
  const errors: string[] = []
  const bodyComp = template.components.find((c): c is { type: 'BODY' } => c.type === 'BODY')
  if (!bodyComp || !(bodyComp as { text?: string }).text?.trim()) {
    errors.push('BODY component is required for product card carousel.')
  }
  const carouselComp = template.components.find((c) => (c as { type: string }).type === 'CAROUSEL') as { type: 'CAROUSEL'; cards: unknown[] } | undefined
  if (!carouselComp || !carouselComp.cards || carouselComp.cards.length < 2) {
    errors.push('PRODUCT_CARD_CAROUSEL requires at least 2 cards.')
  }
  if (template.category !== 'MARKETING') {
    errors.push('PRODUCT_CARD_CAROUSEL is a MARKETING template.')
  }
  return { errors, warnings: [] }
}

// ---------- Main validator ----------

/**
 * Run all validations for the given normalized template.
 * Validates name, language, parameter format, examples, and subtype-specific rules.
 */
export function validateTemplate(template: NormalizedTemplate): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  const nameErr = validateTemplateName(template.name)
  if (nameErr) errors.push(nameErr)

  if (template.subtype === 'AUTHENTICATION_OTP') {
    if (!template.languages?.length) {
      errors.push('Authentication templates require languages[].')
    }
  } else {
    if (!template.language?.trim()) {
      errors.push('Language is required for utility/marketing templates.')
    }
  }

  // Parameter format and examples (for STANDARD / custom components with variables)
  const bodyComp = template.components.find((c): c is BodyComponent => c.type === 'BODY')
  const bodyText = bodyComp?.text ?? ''
  if (bodyText && template.parameterFormat === 'positional') {
    const indices = extractPositionalIndices(bodyText)
    const contiguousErr = validatePositionalContiguous(indices)
    if (contiguousErr) errors.push(contiguousErr)
    if (bodyComp?.variables && bodyComp.variables.length !== indices.length) {
      errors.push('Example count must match positional parameter count.')
    }
  }
  if (bodyText && template.parameterFormat === 'named') {
    const names = extractNamedVariables(bodyText)
    const namesErr = validateNamedParamNames(names)
    if (namesErr) errors.push(namesErr)
  }

  if (bodyComp?.variables?.length) {
    const exampleErrs = validateExamplesForVariables(bodyText, bodyComp.variables, 'Body')
    errors.push(...exampleErrs)
  }

  // Subtype-specific
  let subResult: ValidationResult
  switch (template.subtype) {
    case 'STANDARD':
      subResult = validateStandard(template)
      break
    case 'AUTHENTICATION_OTP':
      subResult = validateAuthRestrictions(template)
      break
    case 'CALL_PERMISSION_REQUEST':
      subResult = validateCallPermissionRequest(template)
      break
    case 'CATALOG':
      subResult = validateCatalog(template)
      break
    case 'LIMITED_TIME_OFFER':
      subResult = validateLimitedTimeOffer(template)
      break
    case 'PRODUCT_CARD_CAROUSEL':
      subResult = validateProductCardCarousel(template)
      break
    default:
      subResult = validateStandard(template)
  }
  errors.push(...subResult.errors)
  warnings.push(...subResult.warnings)

  const categoryRisk = classifyCategoryRisk(bodyText, template.category)
  if (categoryRisk.reasons.length && !warnings.some((w) => categoryRisk.reasons.includes(w))) {
    warnings.push(...categoryRisk.reasons)
  }

  return { errors, warnings }
}
