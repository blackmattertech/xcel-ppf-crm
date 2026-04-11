/**
 * Normalize rows from the external (warranty / claims) database into the CRM customer shape.
 */

const DEALER_KEYS = [
  'dealer_name',
  'dealerName',
  'dealership',
  'dealership_name',
  'dealershipName',
  'dealer',
  'store_name',
  'storeName',
  'showroom_name',
  'showroomName',
  'showroom',
] as const

function pickDealerFromObject(obj: Record<string, unknown>): string | null {
  for (const k of DEALER_KEYS) {
    const v = obj[k]
    if (v != null && String(v).trim()) return String(v).trim()
  }
  return null
}

/** Pull a dealer label from warranty_claims JSON (object, array of objects, or JSON string). */
export function extractDealerFromWarrantyClaims(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === 'string') {
    const t = v.trim()
    if (!t) return null
    try {
      return extractDealerFromWarrantyClaims(JSON.parse(t) as unknown)
    } catch {
      return null
    }
  }
  if (Array.isArray(v)) {
    for (const item of v) {
      if (item && typeof item === 'object') {
        const d = pickDealerFromObject(item as Record<string, unknown>)
        if (d) return d
      }
    }
    return null
  }
  if (typeof v === 'object') {
    return pickDealerFromObject(v as Record<string, unknown>)
  }
  return null
}

function resolveDealerName(row: Record<string, unknown>): string | null {
  const fromRow =
    row.dealer_name ??
    row.dealerName ??
    row.dealership ??
    row.dealership_name ??
    row.dealershipName ??
    row.store_name ??
    row.storeName ??
    row.showroom_name ??
    row.showroomName ??
    row.showroom ??
    row.dealer
  if (fromRow != null && String(fromRow).trim()) return String(fromRow).trim()
  const claims = row.warranty_claims ?? row.warrantyClaims
  return extractDealerFromWarrantyClaims(claims)
}

export function normalizeExternalCustomerRow(
  row: Record<string, unknown>,
  prefixId: string
): Record<string, unknown> {
  const id = row.id != null ? String(row.id) : ''
  const name =
    (row.customer_name ?? row.name ?? row.full_name ?? '').toString().trim() || '—'
  const phone =
    (
      row.customer_mobile ??
      row.phone ??
      row.mobile ??
      row.phone_number ??
      row.alternate_mobile ??
      ''
    )
      .toString()
      .trim() || '—'
  const email =
    (row.customer_email ?? row.email ?? row.store_email) != null
      ? String(row.customer_email ?? row.email ?? row.store_email)
      : null
  const customer_type = (row.customer_type ?? row.type ?? 'new') as string
  const validType = ['new', 'repeat', 'high_value'].includes(customer_type) ? customer_type : 'new'
  let tags: string[] | null = null
  if (Array.isArray(row.tags)) tags = row.tags.map(String)
  else if (row.tags != null && typeof row.tags === 'string') tags = [row.tags]
  const created_at = (row.created_at ?? row.createdAt ?? new Date().toISOString()).toString()
  const updated_at = (row.updated_at ?? row.updatedAt ?? created_at).toString()
  const warranty_claims = (row.warranty_claims ?? row.warrantyClaims) ?? null
  const dealer_name = resolveDealerName(row)

  return {
    id: prefixId + id,
    lead_id: null,
    name,
    phone,
    email,
    customer_type: validType,
    tags,
    created_at,
    updated_at,
    source: 'external' as const,
    car_number: row.car_number != null ? String(row.car_number) : null,
    chassis_number: row.chassis_number != null ? String(row.chassis_number) : null,
    service_type: row.service_type != null ? String(row.service_type) : null,
    series: row.series != null ? String(row.series) : null,
    service_date: row.service_date != null ? String(row.service_date) : null,
    service_location: row.service_location != null ? String(row.service_location) : null,
    dealer_name: dealer_name ?? null,
    warranty_years: row.warranty_years != null ? Number(row.warranty_years) : null,
    ppf_warranty_years: row.ppf_warranty_years != null ? Number(row.ppf_warranty_years) : null,
    car_name: row.car_name != null ? String(row.car_name) : null,
    car_model: row.car_model != null ? String(row.car_model) : null,
    car_photo_url: row.car_photo_url != null ? String(row.car_photo_url) : null,
    chassis_photo_url: row.chassis_photo_url != null ? String(row.chassis_photo_url) : null,
    dealer_invoice_url: row.dealer_invoice_url != null ? String(row.dealer_invoice_url) : null,
    warranty_claims,
  }
}
