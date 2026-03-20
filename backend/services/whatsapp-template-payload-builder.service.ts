/**
 * Transform NormalizedTemplate into Meta API request payloads.
 * Creation: POST /message_templates or POST /upsert_message_templates.
 * Use "name" not "fname" in payloads (per Meta docs).
 */

import type {
  NormalizedTemplate,
  TemplateComponent,
  TemplateButton,
  BodyComponent,
  HeaderComponent,
  FooterComponent,
  ButtonsComponent,
  CarouselComponent,
  CarouselCard,
} from '@/shared/whatsapp-template-types'
import { extractPositionalIndices, extractNamedVariables } from './whatsapp-template-validation.service'

const NAME_REGEX = /^[a-z0-9_]+$/

function toMetaName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 512) || 'template'
}

/** STANDARD: utility/marketing POST /message_templates */
export function buildStandardPayload(normalized: NormalizedTemplate): Record<string, unknown> {
  const name = toMetaName(normalized.name)
  const language = (normalized.language ?? 'en').replace(/-/g, '_')
  const category = normalized.category.toLowerCase()
  const components: Record<string, unknown>[] = []

  for (const c of normalized.components) {
    if (c.type === 'HEADER') {
      const h = c as HeaderComponent
      const comp: Record<string, unknown> = { type: 'header', format: (h.format ?? 'text').toLowerCase() }
      if (h.text) comp.text = h.text
      if (h.headerHandle) comp.example = { header_handle: [h.headerHandle] }
      components.push(comp)
    } else if (c.type === 'BODY') {
      const b = c as BodyComponent
      const comp: Record<string, unknown> = { type: 'body', text: b.text ?? '' }
      if (b.variables?.length) {
        if (normalized.parameterFormat === 'named') {
          comp.example = {
            body_text_named_params: b.variables.map((v) =>
              v.kind === 'named'
                ? { param_name: (v as { name: string }).name, example: (v as { example: string }).example }
                : { param_name: `param_${(v as { index: number }).index}`, example: (v as { example: string }).example }
            ),
          }
        } else {
          const examples = b.variables
            .sort((a, b) => (a.kind === 'positional' ? (a as { index: number }).index : 0) - (b.kind === 'positional' ? (b as { index: number }).index : 0))
            .map((v) => ('example' in v ? (v as { example: string }).example : ''))
          comp.example = { body_text: [examples] }
        }
      }
      components.push(comp)
    } else if (c.type === 'FOOTER') {
      const f = c as FooterComponent
      if (f.text) components.push({ type: 'footer', text: f.text })
    } else if (c.type === 'BUTTONS') {
      const btns = c as ButtonsComponent
      const buttons = btns.buttons.map((b) => mapButtonToMeta(b))
      if (buttons.length) components.push({ type: 'buttons', buttons })
    }
  }

  const payload: Record<string, unknown> = {
    name,
    language,
    category,
    allow_category_change: true,
    components,
  }
  if (normalized.parameterFormat) {
    payload.parameter_format = normalized.parameterFormat
  }
  if (normalized.category === 'UTILITY' && (normalized.subtype === 'ORDER_STATUS' || normalized.subtype === 'ORDER_DETAILS')) {
    payload.sub_category = normalized.subtype.toLowerCase()
  }
  return payload
}

function mapButtonToMeta(b: TemplateButton): Record<string, unknown> {
  const typeMap: Record<string, string> = {
    URL: 'url',
    PHONE_NUMBER: 'phone_number',
    QUICK_REPLY: 'quick_reply',
    COPY_CODE: 'copy_code',
    CALL_REQUEST: 'call_request',
    CATALOG: 'catalog',
    FLOW: 'flow',
  }
  const type = typeMap[b.type] ?? b.type.toLowerCase()
  const btn: Record<string, unknown> = { type }
  if ('text' in b && b.text) btn.text = b.text
  if (b.type === 'URL' && 'url' in b && b.url) btn.url = b.url
  if (b.type === 'PHONE_NUMBER' && 'phoneNumber' in b) btn.phone_number = b.phoneNumber
  if ('example' in b && b.example) btn.example = Array.isArray(b.example) ? b.example : [b.example]
  return btn
}

/** AUTHENTICATION: POST /upsert_message_templates; languages[] not language; no text/autofill_text */
export function buildAuthenticationUpsertPayload(normalized: NormalizedTemplate): Record<string, unknown> {
  const name = toMetaName(normalized.name)
  const languages = normalized.languages ?? [normalized.language ?? 'en_US']
  const components: Record<string, unknown>[] = []

  for (const c of normalized.components) {
    if (c.type === 'BODY') {
      const b = c as BodyComponent
      const comp: Record<string, unknown> = { type: 'BODY' }
      if (b.addSecurityRecommendation != null) comp.add_security_recommendation = b.addSecurityRecommendation
      components.push(comp)
    } else if (c.type === 'FOOTER') {
      const f = c as FooterComponent
      const comp: Record<string, unknown> = { type: 'FOOTER' }
      if (f.codeExpirationMinutes != null) comp.code_expiration_minutes = f.codeExpirationMinutes
      components.push(comp)
    } else if (c.type === 'BUTTONS') {
      const btns = c as ButtonsComponent
      const buttons = btns.buttons
        .filter((b) => b.type === 'OTP')
        .map((b) => {
          const o: Record<string, unknown> = { type: 'OTP', otp_type: (b as { otpType: string }).otpType }
          if ((b as { supportedApps?: unknown[] }).supportedApps?.length) {
            o.supported_apps = (b as { supportedApps: Array<{ packageName: string; signatureHash: string }> }).supportedApps.map(
              (a) => ({ package_name: a.packageName, signature_hash: a.signatureHash })
            )
          }
          return o
        })
      if (buttons.length) components.push({ type: 'BUTTONS', buttons })
    }
  }

  return {
    name,
    languages: languages.map((l) => l.replace(/-/g, '_')),
    category: 'AUTHENTICATION',
    components,
  }
}

/** CALL_PERMISSION_REQUEST: BODY + call_permission_request */
export function buildCallPermissionRequestPayload(normalized: NormalizedTemplate): Record<string, unknown> {
  const name = toMetaName(normalized.name)
  const language = (normalized.language ?? 'en').replace(/-/g, '_')
  const category = normalized.category.toLowerCase()
  const components: Record<string, unknown>[] = []

  for (const c of normalized.components) {
    if (c.type === 'BODY') {
      const b = c as BodyComponent
      const comp: Record<string, unknown> = { type: 'body', text: b.text ?? '' }
      if (b.variables?.length) {
        comp.example = {
          body_text: [b.variables.map((v) => ('example' in v ? (v as { example: string }).example : ''))],
        }
      }
      components.push(comp)
    } else if ((c as { type: string }).type === 'call_permission_request') {
      components.push({ type: 'call_permission_request' })
    }
  }

  return {
    name,
    language,
    category,
    allow_category_change: true,
    components,
  }
}

/** CATALOG: BODY, optional FOOTER, BUTTONS with catalog */
export function buildCatalogPayload(normalized: NormalizedTemplate): Record<string, unknown> {
  const name = toMetaName(normalized.name)
  const language = (normalized.language ?? 'en').replace(/-/g, '_')
  const components: Record<string, unknown>[] = []

  for (const c of normalized.components) {
    if (c.type === 'BODY') {
      const b = c as BodyComponent
      const comp: Record<string, unknown> = { type: 'body', text: b.text ?? '' }
      if (b.variables?.length) {
        comp.example = { body_text: [b.variables.map((v) => ('example' in v ? (v as { example: string }).example : ''))] }
      }
      components.push(comp)
    } else if (c.type === 'FOOTER' && (c as FooterComponent).text) {
      components.push({ type: 'footer', text: (c as FooterComponent).text })
    } else if (c.type === 'BUTTONS') {
      const btns = (c as ButtonsComponent).buttons.filter((b) => b.type === 'CATALOG')
      if (btns.length) {
        components.push({ type: 'buttons', buttons: btns.map((b) => ({ type: 'catalog', text: (b as { text?: string }).text ?? 'View catalog' })) })
      }
    }
  }

  return {
    name,
    language,
    category: 'marketing',
    allow_category_change: true,
    components,
  }
}

/** LIMITED_TIME_OFFER: optional HEADER, limited_time_offer, BODY, BUTTONS */
export function buildLimitedTimeOfferPayload(normalized: NormalizedTemplate): Record<string, unknown> {
  const name = toMetaName(normalized.name)
  const language = (normalized.language ?? 'en').replace(/-/g, '_')
  const components: Record<string, unknown>[] = []

  for (const c of normalized.components) {
    if (c.type === 'HEADER') {
      const h = c as HeaderComponent
      const comp: Record<string, unknown> = { type: 'header', format: (h.format ?? 'text').toLowerCase() }
      if (h.text) comp.text = h.text
      if (h.headerHandle) comp.example = { header_handle: [h.headerHandle] }
      components.push(comp)
    } else if ((c as { type: string }).type === 'limited_time_offer') {
      components.push({ type: 'limited_time_offer', text: (c as { text: string }).text })
    } else if (c.type === 'BODY') {
      const b = c as BodyComponent
      const comp: Record<string, unknown> = { type: 'body', text: b.text ?? '' }
      if (b.variables?.length) {
        comp.example = { body_text: [b.variables.map((v) => ('example' in v ? (v as { example: string }).example : ''))] }
      }
      components.push(comp)
    } else if (c.type === 'BUTTONS') {
      const buttons = (c as ButtonsComponent).buttons.map((b) => mapButtonToMeta(b))
      if (buttons.length) components.push({ type: 'buttons', buttons })
    }
  }

  return {
    name,
    language,
    category: 'marketing',
    allow_category_change: true,
    components,
  }
}

/** PRODUCT_CARD_CAROUSEL: BODY + CAROUSEL with cards */
export function buildProductCardCarouselPayload(normalized: NormalizedTemplate): Record<string, unknown> {
  const name = toMetaName(normalized.name)
  const language = (normalized.language ?? 'en').replace(/-/g, '_')
  const components: Record<string, unknown>[] = []

  for (const c of normalized.components) {
    if (c.type === 'BODY') {
      const b = c as BodyComponent
      const comp: Record<string, unknown> = { type: 'body', text: b.text ?? '' }
      if (b.variables?.length) {
        comp.example = { body_text: [b.variables.map((v) => ('example' in v ? (v as { example: string }).example : ''))] }
      }
      components.push(comp)
    } else if ((c as { type: string }).type === 'CAROUSEL') {
      const car = c as CarouselComponent
      const cards = (car.cards ?? []).map((card: CarouselCard) => {
        const metaCard: Record<string, unknown> = {}
        if (card.productRetailerId) metaCard.product_retailer_id = card.productRetailerId
        if (card.catalogId) metaCard.catalog_id = card.catalogId
        if (card.body) metaCard.body = card.body
        if (card.buttons?.length) {
          metaCard.buttons = card.buttons.map((b) => mapButtonToMeta(b))
        }
        return metaCard
      })
      if (cards.length >= 2) components.push({ type: 'carousel', cards })
    }
  }

  return {
    name,
    language,
    category: 'marketing',
    allow_category_change: true,
    components,
  }
}

/** Router: build creation payload by subtype */
export function buildCreationPayload(normalized: NormalizedTemplate): Record<string, unknown> {
  switch (normalized.subtype) {
    case 'AUTHENTICATION_OTP':
      return buildAuthenticationUpsertPayload(normalized)
    case 'CALL_PERMISSION_REQUEST':
      return buildCallPermissionRequestPayload(normalized)
    case 'CATALOG':
      return buildCatalogPayload(normalized)
    case 'LIMITED_TIME_OFFER':
      return buildLimitedTimeOfferPayload(normalized)
    case 'PRODUCT_CARD_CAROUSEL':
      return buildProductCardCarouselPayload(normalized)
    case 'FLOWS':
    case 'ORDER_DETAILS':
    case 'ORDER_STATUS':
    case 'STANDARD':
    default:
      return buildStandardPayload(normalized)
  }
}
