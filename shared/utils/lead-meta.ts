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
      'what service you are looking for',
      'what service are you looking for',
      'product_interest',
      'service',
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
