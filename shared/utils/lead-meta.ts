/**
 * Extract interested product/service from lead meta_data.
 * Handles both direct keys and field_data array (from Meta Lead Ads).
 */
export function getInterestedProductFromMeta(metaData: Record<string, any> | null): string {
  if (!metaData || typeof metaData !== 'object') return ''

  // Direct keys (various naming conventions)
  const directKeys = [
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

/**
 * Extract city from lead meta_data.
 */
export function getCityFromMeta(metaData: Record<string, any> | null): string {
  if (!metaData || typeof metaData !== 'object') return ''
  const directKeys = ['city', 'City', 'location', 'Location']
  for (const key of directKeys) {
    const val = metaData[key]
    if (val && typeof val === 'string') return String(val).trim()
  }
  const fieldData = metaData.field_data
  if (Array.isArray(fieldData)) {
    const cityFields = ['city', 'location', 'your city']
    for (const field of fieldData) {
      const name = (field?.name || '').toLowerCase()
      const value = field?.values?.[0]
      if (value && cityFields.some((fn) => name.includes(fn))) return String(value).trim()
    }
  }
  return ''
}

/**
 * Extract state from lead meta_data.
 */
export function getStateFromMeta(metaData: Record<string, any> | null): string {
  if (!metaData || typeof metaData !== 'object') return ''
  const directKeys = ['state', 'State', 'region', 'Region']
  for (const key of directKeys) {
    const val = metaData[key]
    if (val && typeof val === 'string') return String(val).trim()
  }
  const fieldData = metaData.field_data
  if (Array.isArray(fieldData)) {
    const stateFields = ['state', 'region', 'your state']
    for (const field of fieldData) {
      const name = (field?.name || '').toLowerCase()
      const value = field?.values?.[0]
      if (value && stateFields.some((fn) => name.includes(fn))) return String(value).trim()
    }
  }
  return ''
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
