/**
 * Build send-time payloads for POST /messages (template message) by subtype.
 * Used when sending a template to a recipient.
 */

import type { NormalizedTemplate, TemplateButton } from '@/shared/whatsapp-template-types'

export interface SendTemplateOptions {
  to: string
  templateName: string
  templateLanguage: string
  bodyParameters?: string[]
  headerParameters?: string[]
  headerFormat?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'
  headerMediaId?: string | null
  /** CALL_PERMISSION_REQUEST: no extra params */
  /** CATALOG: thumbnail_product_retailer_id for catalog button */
  thumbnailProductRetailerId?: string
  /** LIMITED_TIME_OFFER: expiration_time_ms */
  expirationTimeMs?: number
  /** LIMITED_TIME_OFFER: button payloads for copy_code / URL */
  buttonPayloads?: Record<string, string>
  /** PRODUCT_CARD_CAROUSEL: cards (up to 10) with product_retailer_id, catalog_id, etc. */
  carouselCards?: Array<{
    productRetailerId?: string
    catalogId?: string
    bodyParams?: string[]
    buttonPayloads?: Record<string, string>
  }>
}

/** Build template components array for send API (Meta POST /messages) */
export function buildStandardSendPayload(options: SendTemplateOptions): { template: Record<string, unknown> } {
  const components: Record<string, unknown>[] = []
  const headerFormat = options.headerFormat ?? 'TEXT'
  const headerParams = options.headerParameters ?? []

  if (headerFormat === 'TEXT' && headerParams.length > 0) {
    components.push({
      type: 'header',
      parameters: headerParams.map((text) => ({ type: 'text', text })),
    })
  } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerFormat) && headerParams.length > 0) {
    const value = headerParams[0]
    const mediaType = headerFormat.toLowerCase()
    components.push({
      type: 'header',
      parameters: [
        {
          type: mediaType,
          [mediaType]: value.startsWith('http') ? { link: value } : { id: value },
        },
      ],
    })
  }

  if (options.bodyParameters?.length) {
    components.push({
      type: 'body',
      parameters: options.bodyParameters.map((text) => ({ type: 'text', text })),
    })
  }

  const template: Record<string, unknown> = {
    name: options.templateName,
    language: { code: (options.templateLanguage || 'en').replace(/-/g, '_') },
    components: components.length ? components : undefined,
  }
  return { template }
}

/** Call permission request: BODY params only; template includes call_permission_request */
export function buildCallPermissionRequestSendPayload(options: SendTemplateOptions): { template: Record<string, unknown> } {
  const components: Record<string, unknown>[] = []
  if (options.bodyParameters?.length) {
    components.push({
      type: 'body',
      parameters: options.bodyParameters.map((text) => ({ type: 'text', text })),
    })
  }
  return {
    template: {
      name: options.templateName,
      language: { code: (options.templateLanguage || 'en').replace(/-/g, '_') },
      components: components.length ? components : undefined,
    },
  }
}

/** Catalog: body params; button action with thumbnail_product_retailer_id */
export function buildCatalogSendPayload(options: SendTemplateOptions): { template: Record<string, unknown> } {
  const components: Record<string, unknown>[] = []
  if (options.bodyParameters?.length) {
    components.push({
      type: 'body',
      parameters: options.bodyParameters.map((text) => ({ type: 'text', text })),
    })
  }
  if (options.thumbnailProductRetailerId) {
    components.push({
      type: 'button',
      sub_type: 'catalog',
      index: '0',
      parameters: [{ type: 'catalog', catalog_id: options.thumbnailProductRetailerId }],
    })
  }
  return {
    template: {
      name: options.templateName,
      language: { code: (options.templateLanguage || 'en').replace(/-/g, '_') },
      components: components.length ? components : undefined,
    },
  }
}

/** Limited time offer: body params; expiration_time_ms; button payload mapping */
export function buildLimitedTimeOfferSendPayload(options: SendTemplateOptions): { template: Record<string, unknown> } {
  const components: Record<string, unknown>[] = []

  if (options.headerParameters?.length && options.headerFormat) {
    const headerFormat = options.headerFormat.toLowerCase()
    const val = options.headerParameters[0]
    components.push({
      type: 'header',
      parameters: [{ type: headerFormat, [headerFormat]: val.startsWith('http') ? { link: val } : { id: val } }],
    })
  }

  if (options.bodyParameters?.length) {
    components.push({
      type: 'body',
      parameters: options.bodyParameters.map((text) => ({ type: 'text', text })),
    })
  }

  if (options.expirationTimeMs != null) {
    components.push({
      type: 'limited_time_offer',
      parameters: [{ type: 'expiration_time_ms', expiration_time_ms: options.expirationTimeMs }],
    })
  }

  if (options.buttonPayloads && Object.keys(options.buttonPayloads).length > 0) {
    Object.entries(options.buttonPayloads).forEach(([index, payload], i) => {
      components.push({
        type: 'button',
        sub_type: 'copy_code',
        index: String(i),
        parameters: [{ type: 'coupon_code', coupon_code: payload }],
      })
    })
  }

  return {
    template: {
      name: options.templateName,
      language: { code: (options.templateLanguage || 'en').replace(/-/g, '_') },
      components: components.length ? components : undefined,
    },
  }
}

/** Product card carousel: body params; carousel cards (up to 10) with product_retailer_id, catalog_id */
export function buildProductCardCarouselSendPayload(options: SendTemplateOptions): { template: Record<string, unknown> } {
  const components: Record<string, unknown>[] = []

  if (options.bodyParameters?.length) {
    components.push({
      type: 'body',
      parameters: options.bodyParameters.map((text) => ({ type: 'text', text })),
    })
  }

  if (options.carouselCards?.length) {
    const cards = options.carouselCards.slice(0, 10).map((card) => {
      const params: Record<string, unknown>[] = []
      if (card.productRetailerId) {
        params.push({
          type: 'product',
          product: {
            catalog_id: card.catalogId ?? '',
            product_retailer_id: card.productRetailerId,
          },
        })
      }
      if (card.bodyParams?.length) {
        params.push({
          type: 'body',
          parameters: card.bodyParams.map((text) => ({ type: 'text', text })),
        })
      }
      if (card.buttonPayloads && Object.keys(card.buttonPayloads).length > 0) {
        Object.values(card.buttonPayloads).forEach((payload) => {
          params.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: payload }] })
        })
      }
      return { card_components: params }
    })
    components.push({ type: 'carousel', cards })
  }

  return {
    template: {
      name: options.templateName,
      language: { code: (options.templateLanguage || 'en').replace(/-/g, '_') },
      components: components.length ? components : undefined,
    },
  }
}

export type TemplateSubtype = 'STANDARD' | 'AUTHENTICATION_OTP' | 'CALL_PERMISSION_REQUEST' | 'CATALOG' | 'LIMITED_TIME_OFFER' | 'PRODUCT_CARD_CAROUSEL'

/** Router: build send payload by subtype */
export function buildSendPayload(
  subtype: TemplateSubtype,
  options: SendTemplateOptions
): { template: Record<string, unknown> } {
  switch (subtype) {
    case 'CALL_PERMISSION_REQUEST':
      return buildCallPermissionRequestSendPayload(options)
    case 'CATALOG':
      return buildCatalogSendPayload(options)
    case 'LIMITED_TIME_OFFER':
      return buildLimitedTimeOfferSendPayload(options)
    case 'PRODUCT_CARD_CAROUSEL':
      return buildProductCardCarouselSendPayload(options)
    case 'STANDARD':
    case 'AUTHENTICATION_OTP':
    default:
      return buildStandardSendPayload(options)
  }
}
