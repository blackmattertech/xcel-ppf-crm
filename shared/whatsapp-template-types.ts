/**
 * WhatsApp template management: normalized types and Zod schemas.
 * Category = UTILITY | MARKETING | AUTHENTICATION; subtype = STANDARD | AUTHENTICATION_OTP | etc.
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Enums and primitives
// ---------------------------------------------------------------------------

export type TemplateCategory = 'UTILITY' | 'MARKETING' | 'AUTHENTICATION'

export type TemplateSubtype =
  | 'STANDARD'
  | 'AUTHENTICATION_OTP'
  | 'CALL_PERMISSION_REQUEST'
  | 'CATALOG'
  | 'LIMITED_TIME_OFFER'
  | 'PRODUCT_CARD_CAROUSEL'
  | 'FLOWS'
  | 'ORDER_DETAILS'
  | 'ORDER_STATUS'

export type ParameterFormat = 'named' | 'positional' | null

export type HeaderFormat = 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION'

// ---------------------------------------------------------------------------
// Variables
// ---------------------------------------------------------------------------

export type TemplateVariable =
  | { kind: 'named'; name: string; example: string }
  | { kind: 'positional'; index: number; example: string }

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

export type TemplateButton =
  | { type: 'URL'; text: string; url?: string; example?: string }
  | { type: 'PHONE_NUMBER'; text: string; phoneNumber: string; example?: string }
  | { type: 'QUICK_REPLY'; text: string }
  | { type: 'COPY_CODE'; text?: string; example?: string }
  | { type: 'CALL_REQUEST'; text?: string }
  | {
      type: 'OTP'
      otpType: 'COPY_CODE' | 'ONE_TAP' | 'ZERO_TAP'
      supportedApps?: Array<{ packageName: string; signatureHash: string }>
    }
  | { type: 'CATALOG'; text?: string }
  | { type: 'FLOW'; text?: string; flowId?: string; flowCta?: string }

// ---------------------------------------------------------------------------
// Components (generic + subtype-specific)
// ---------------------------------------------------------------------------

export interface HeaderComponent {
  type: 'HEADER'
  format: HeaderFormat
  text?: string
  headerHandle?: string
}

export interface BodyComponent {
  type: 'BODY'
  text?: string
  addSecurityRecommendation?: boolean
  codeExpirationMinutes?: number
  variables?: TemplateVariable[]
}

export interface FooterComponent {
  type: 'FOOTER'
  text?: string
  codeExpirationMinutes?: number
}

export interface ButtonsComponent {
  type: 'BUTTONS'
  buttons: TemplateButton[]
}

export interface CallPermissionRequestComponent {
  type: 'call_permission_request'
  // Meta uses this as a component with no extra fields beyond type
}

export interface LimitedTimeOfferComponent {
  type: 'limited_time_offer'
  text: string // max 16 chars
}

export interface CarouselCard {
  productRetailerId?: string
  catalogId?: string
  body?: string
  buttons?: TemplateButton[]
}

export interface CarouselComponent {
  type: 'CAROUSEL'
  cards: CarouselCard[]
}

export type TemplateComponent =
  | HeaderComponent
  | BodyComponent
  | FooterComponent
  | ButtonsComponent
  | CallPermissionRequestComponent
  | LimitedTimeOfferComponent
  | CarouselComponent

// ---------------------------------------------------------------------------
// Normalized template (internal model)
// ---------------------------------------------------------------------------

export interface NormalizedTemplate {
  id?: string
  workspaceId?: string
  wabaId: string
  name: string
  category: TemplateCategory
  subtype: TemplateSubtype
  language?: string
  languages?: string[]
  parameterFormat: ParameterFormat
  components: TemplateComponent[]
  warnings?: string[]
  errors?: string[]
}

// ---------------------------------------------------------------------------
// Zod schemas (runtime validation)
// ---------------------------------------------------------------------------

export const templateCategorySchema = z.enum(['UTILITY', 'MARKETING', 'AUTHENTICATION'])
export const templateSubtypeSchema = z.enum([
  'STANDARD',
  'AUTHENTICATION_OTP',
  'CALL_PERMISSION_REQUEST',
  'CATALOG',
  'LIMITED_TIME_OFFER',
  'PRODUCT_CARD_CAROUSEL',
  'FLOWS',
  'ORDER_DETAILS',
  'ORDER_STATUS',
])
export const parameterFormatSchema = z.enum(['named', 'positional']).nullable()
export const headerFormatSchema = z.enum(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', 'LOCATION'])

export const templateNameSchema = z
  .string()
  .min(1, 'Name is required')
  .max(512, 'Name max 512 characters')
  .regex(/^[a-z0-9_]+$/, 'Name must be lowercase letters, numbers, underscores only')

export const templateVariableNamedSchema = z.object({
  kind: z.literal('named'),
  name: z.string().regex(/^[a-z_][a-z0-9_]*$/),
  example: z.string(),
})
export const templateVariablePositionalSchema = z.object({
  kind: z.literal('positional'),
  index: z.number().int().positive(),
  example: z.string(),
})
export const templateVariableSchema = z.union([
  templateVariableNamedSchema,
  templateVariablePositionalSchema,
])

export const templateButtonUrlSchema = z.object({
  type: z.literal('URL'),
  text: z.string().max(25),
  url: z.string().optional(),
  example: z.string().optional(),
})
export const templateButtonPhoneSchema = z.object({
  type: z.literal('PHONE_NUMBER'),
  text: z.string().max(25),
  phoneNumber: z.string().max(20),
  example: z.string().optional(),
})
export const templateButtonQuickReplySchema = z.object({
  type: z.literal('QUICK_REPLY'),
  text: z.string().max(25),
})
export const templateButtonCopyCodeSchema = z.object({
  type: z.literal('COPY_CODE'),
  text: z.string().max(25).optional(),
  example: z.string().max(15).optional(),
})
export const templateButtonOtpSchema = z.object({
  type: z.literal('OTP'),
  otpType: z.enum(['COPY_CODE', 'ONE_TAP', 'ZERO_TAP']),
  supportedApps: z
    .array(
      z.object({
        packageName: z.string(),
        signatureHash: z.string(),
      })
    )
    .optional(),
})
export const templateButtonCatalogSchema = z.object({
  type: z.literal('CATALOG'),
  text: z.string().optional(),
})
export const templateButtonFlowSchema = z.object({
  type: z.literal('FLOW'),
  text: z.string().max(25).optional(),
  flowId: z.string().optional(),
  flowCta: z.string().optional(),
})

export const carouselCardSchema = z.object({
  productRetailerId: z.string().optional(),
  catalogId: z.string().optional(),
  body: z.string().optional(),
  buttons: z.array(
    z.union([
      templateButtonUrlSchema,
      templateButtonPhoneSchema,
      templateButtonQuickReplySchema,
      templateButtonCopyCodeSchema,
      templateButtonCatalogSchema,
    ])
  ).optional(),
})

export const normalizedTemplateSchema = z.object({
  id: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
  wabaId: z.string(),
  name: templateNameSchema,
  category: templateCategorySchema,
  subtype: templateSubtypeSchema,
  language: z.string().max(10).optional(),
  languages: z.array(z.string().max(10)).optional(),
  parameterFormat: parameterFormatSchema,
  components: z.array(z.unknown()), // component discriminated by type
  warnings: z.array(z.string()).optional(),
  errors: z.array(z.string()).optional(),
})

export type TemplateDraftRow = {
  id: string
  created_by: string | null
  updated_by: string | null
  waba_id: string | null
  category: string
  template_subtype: string
  mode: string
  name: string
  language: string | null
  languages_json: unknown
  parameter_format: string | null
  components_json: unknown
  normalized_template_json: unknown
  validation_errors_json: unknown
  validation_warnings_json: unknown
  preview_json: unknown
  submit_state: string
  created_at: string
  updated_at: string
}

export type TemplateWebhookEventRow = {
  id: string
  waba_id: string
  meta_template_id: string | null
  event_type: string
  dedupe_key: string
  payload_json: unknown
  processed: boolean
  processed_at: string | null
  created_at: string
}

export type TemplateStatusHistoryRow = {
  id: string
  whatsapp_template_id: string
  old_status: string | null
  new_status: string | null
  old_category: string | null
  new_category: string | null
  source: 'webhook' | 'poll' | 'manual'
  reason: string | null
  created_at: string
}
