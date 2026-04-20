/**
 * Extract interested product/service from lead meta_data.
 * Handles both direct keys and field_data array (from Meta Lead Ads).
 */
export function getInterestedProductFromMeta(metaData: Record<string, any> | null): string {
  if (!metaData || typeof metaData !== 'object') return ''

  // Direct keys (various naming conventions)
  const directKeys = [
    "what_services_you're_looking_for?",
    "what_services_you're_looking_for",
    'what_services_are_you_looking_for?',
    'what_services_are_you_looking_for',
    'What services are you looking for?',
    'what service you are looking for?',
    'what service you are looking for',
    'What service are you looking for?',
    'product_interest',
    'service',
    'interested_product',
  ]
  for (const key of directKeys) {
    const val = metaData[key]
    if (val && typeof val === 'string') return String(val).replace(/_/g, ' ')
  }

  // Extract from field_data array (Meta Lead Ads format)
  const fieldData = metaData.field_data
  if (Array.isArray(fieldData)) {
    const serviceFieldNames = [
      'what_services_are_you_looking_for',
      'what services are you looking for',
      'what service you are looking for',
      'what_service_are_you_looking_for',
      "what_services_you're_looking_for",
      "what services you're looking for",
      'product_interest',
      'service',
      'service',
      'product',
      'interested_product',
    ]
    for (const field of fieldData) {
      const name = (field?.name || '').toLowerCase().replace(/_/g, ' ')
      const value = field?.values?.[0]
      if (value && serviceFieldNames.some((fn) => name.includes(fn))) {
        return String(value).replace(/_/g, ' ')
      }
    }
  }

  return ''
}

/**
 * Extract car model from lead meta_data.
 * Handles both direct keys and field_data array (from Meta Lead Ads).
 */
export function getCarModelFromMeta(metaData: Record<string, any> | null): string {
  if (!metaData || typeof metaData !== 'object') return ''

  // Direct keys (including Meta form question-style keys)
  const directKeys = [
    'car_model',
    'Car Model',
    'car',
    'car',
    'vehicle_model',
    'Vehicle Model',
    'vehicle',
    'Vehicle',
    'which_car_do_you_have?',
    'which_car_do_you_have',
    'Which car do you have?',
  ]
  for (const key of directKeys) {
    const val = metaData[key]
    if (val && typeof val === 'string') return String(val).replace(/_/g, ' ')
  }

  // Extract from field_data array (Meta Lead Ads: full_name, phone, which_car_do_you_have?, etc.)
  const fieldData = metaData.field_data
  if (Array.isArray(fieldData)) {
    const carFieldNames = [
      'car_model',
      'car model',
      'vehicle_model',
      'vehicle model',
      'vehicle',
      'which_car_do_you_have',
      'which car do you have',
      'which_car',
      'which car',
    ]
    for (const field of fieldData) {
      const name = (field?.name || '').toLowerCase()
      const value = field?.values?.[0]
      if (value && carFieldNames.some((fn) => name.includes(fn))) {
        return String(value).replace(/_/g, ' ')
      }
    }
  }

  return ''
}

/** City-like field name fragments (Meta form question text often varies). */
const CITY_FIELD_MATCHERS = [
  'city',
  'location',
  'your city',
  'city name',
  'where are you located',
  'where do you live',
  'area',
  'locality',
  'town',
]

/** State/region-like field name fragments. */
const STATE_FIELD_MATCHERS = [
  'state',
  'region',
  'your state',
  'state/region',
  'state or province',
  'province',
  'region/state',
]

/** Field names that may contain "City, State" or "City, State, Country". */
const ADDRESS_LIKE_FIELD_MATCHERS = [
  'address',
  'full address',
  'location',
  'where are you located',
  'city and state',
  'city, state',
]

function parseAddressValue(value: string): { city: string; state: string } | null {
  const trimmed = String(value).trim()
  if (!trimmed || !trimmed.includes(',')) return null
  const parts = trimmed.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length >= 2) {
    return { city: parts[0], state: parts[1] }
  }
  return null
}

/**
 * Extract city and state from lead meta_data in one pass.
 * Tries dedicated city/state fields first, then parses address-like fields (e.g. "Mumbai, Maharashtra").
 */
export function getLocationFromMeta(metaData: Record<string, any> | null): { city: string; state: string } {
  const empty = { city: '', state: '' }
  if (!metaData || typeof metaData !== 'object') return empty

  const directCity = metaData.city ?? metaData.City ?? metaData.location ?? metaData.Location
  const directState = metaData.state ?? metaData.State ?? metaData.region ?? metaData.Region
  if (directCity && typeof directCity === 'string') {
    const state = (directState && typeof directState === 'string') ? String(directState).trim() : ''
    return { city: String(directCity).trim(), state }
  }
  if (directState && typeof directState === 'string') {
    return { city: '', state: String(directState).trim() }
  }

  const fieldData = metaData.field_data
  if (!Array.isArray(fieldData)) return empty

  let city = ''
  let state = ''
  let parsedFromAddress: { city: string; state: string } | null = null

  for (const field of fieldData) {
    const name = (field?.name || '').toLowerCase()
    const value = field?.values?.[0]
    if (!value || typeof value !== 'string') continue
    const v = String(value).trim()

    // Prefer parsing "City, State" from address-like fields when value contains comma
    if (ADDRESS_LIKE_FIELD_MATCHERS.some((fn) => name.includes(fn)) && v.includes(',')) {
      const parsed = parseAddressValue(v)
      if (parsed && !parsedFromAddress) parsedFromAddress = parsed
      continue
    }
    if (CITY_FIELD_MATCHERS.some((fn) => name.includes(fn)) && !name.includes('state') && !name.includes('region')) {
      city = v
    } else if (STATE_FIELD_MATCHERS.some((fn) => name.includes(fn))) {
      state = v
    }
  }

  if (city || state) {
    return { city, state }
  }
  if (parsedFromAddress) {
    return parsedFromAddress
  }
  return empty
}

/**
 * Extract city from lead meta_data.
 */
export function getCityFromMeta(metaData: Record<string, any> | null): string {
  return getLocationFromMeta(metaData).city
}

/**
 * Extract state from lead meta_data.
 */
export function getStateFromMeta(metaData: Record<string, any> | null): string {
  return getLocationFromMeta(metaData).state
}

/**
 * Extract country from lead meta_data.
 */
export function getCountryFromMeta(metaData: Record<string, any> | null): string {
  if (!metaData || typeof metaData !== 'object') return ''
  const directKeys = ['country', 'Country']
  for (const key of directKeys) {
    const val = metaData[key]
    if (val && typeof val === 'string') return String(val).trim()
  }
  const fieldData = metaData.field_data
  if (Array.isArray(fieldData)) {
    const countryFields = ['country', 'your country']
    for (const field of fieldData) {
      const name = (field?.name || '').toLowerCase()
      const value = field?.values?.[0]
      if (value && countryFields.some((fn) => name.includes(fn))) return String(value).trim()
    }
  }
  return ''
}

/**
 * Build requirement string from meta_data (e.g. from Meta Lead Ads field_data).
 * Use when creating a lead from Meta so car model and interested product are stored on the lead.
 */
export function buildRequirementFromMeta(metaData: Record<string, any> | null): string {
  if (!metaData || typeof metaData !== 'object') return ''
  const service = getInterestedProductFromMeta(metaData)
  const carModel = getCarModelFromMeta(metaData)
  const parts: string[] = []
  if (service) parts.push(service)
  if (carModel) parts.push(`Car Model: ${carModel}`)
  return parts.join(' | ')
}
