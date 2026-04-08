import { z } from 'zod'

export const landingFormFieldSchema = z.object({
  id: z.string().min(1).max(80).regex(/^[a-z0-9_-]+$/i, 'id: letters, numbers, hyphen, underscore only'),
  type: z.enum(['text', 'textarea', 'tel', 'email', 'select']),
  label: z.string().min(1).max(200),
  placeholder: z.string().max(500).optional(),
  required: z.boolean(),
  mapsTo: z
    .string()
    .min(1)
    .max(120)
    .refine(
      (s) =>
        ['name', 'phone', 'email', 'requirement', 'timeline', 'budget_range', 'interest_level'].includes(s) ||
        s.startsWith('meta:'),
      { message: 'mapsTo must be a lead column or meta:key' }
    ),
  options: z.array(z.string().min(1).max(200)).max(50).optional(),
  order: z.number().int().min(0).max(999),
})

export type LandingFormField = z.infer<typeof landingFormFieldSchema>

export const landingFormFieldsArraySchema = z.array(landingFormFieldSchema).min(1).max(30)

/** Preset used when DB row has empty form_fields (should not happen after migration). */
export const DEFAULT_LANDING_FORM_FIELDS: LandingFormField[] = [
  {
    id: 'name',
    type: 'text',
    label: 'Name',
    placeholder: 'Your name',
    required: true,
    mapsTo: 'name',
    order: 0,
  },
  {
    id: 'phone',
    type: 'tel',
    label: 'Phone',
    placeholder: 'Phone number',
    required: true,
    mapsTo: 'phone',
    order: 1,
  },
  {
    id: 'email',
    type: 'email',
    label: 'Email',
    placeholder: 'Email (optional)',
    required: false,
    mapsTo: 'email',
    order: 2,
  },
  {
    id: 'message',
    type: 'textarea',
    label: 'Message',
    placeholder: 'How can we help?',
    required: false,
    mapsTo: 'requirement',
    order: 3,
  },
]

export function parseLandingFormFields(raw: unknown): LandingFormField[] {
  const parsed = landingFormFieldsArraySchema.safeParse(raw)
  if (!parsed.success) return DEFAULT_LANDING_FORM_FIELDS
  const sorted = [...parsed.data].sort((a, b) => a.order - b.order)
  const hasName = sorted.some((f) => f.mapsTo === 'name')
  const hasPhone = sorted.some((f) => f.mapsTo === 'phone')
  if (!hasName || !hasPhone) return DEFAULT_LANDING_FORM_FIELDS
  return sorted
}

const INTEREST_LEVELS = new Set(['hot', 'warm', 'cold'])

export type LandingLeadPayload = {
  name: string
  phone: string
  email: string | null
  requirement: string | null
  timeline: string | null
  budget_range: string | null
  interest_level: 'hot' | 'warm' | 'cold' | null
  meta_data: Record<string, unknown>
}

export function buildLeadFromLandingFields(
  fields: Record<string, unknown>,
  defs: LandingFormField[]
): { ok: true; payload: LandingLeadPayload } | { ok: false; error: string } {
  const meta_data: Record<string, unknown> = {
    capture: 'public_landing',
  }

  let name = ''
  let phone = ''
  let email: string | null = null
  let requirement: string | null = null
  let timeline: string | null = null
  let budget_range: string | null = null
  let interest_level: 'hot' | 'warm' | 'cold' | null = null

  const sorted = [...defs].sort((a, b) => a.order - b.order)

  for (const def of sorted) {
    const raw = fields[def.id]
    let value = typeof raw === 'string' ? raw.trim() : raw == null ? '' : String(raw).trim()

    if (def.type === 'select' && def.options?.length) {
      if (value && !def.options.includes(value)) {
        return { ok: false, error: `Invalid option for ${def.label}` }
      }
    }

    if (def.required && !value) {
      return { ok: false, error: `${def.label} is required` }
    }

    if (!value) continue

    switch (def.mapsTo) {
      case 'name':
        name = value.slice(0, 200)
        break
      case 'phone':
        phone = value.slice(0, 40)
        break
      case 'email':
        email = value.slice(0, 320)
        break
      case 'requirement':
        requirement = value.slice(0, 5000)
        break
      case 'timeline':
        timeline = value.slice(0, 500)
        break
      case 'budget_range':
        budget_range = value.slice(0, 200)
        break
      case 'interest_level':
        if (!INTEREST_LEVELS.has(value.toLowerCase())) {
          return { ok: false, error: `Invalid interest level for ${def.label}` }
        }
        interest_level = value.toLowerCase() as 'hot' | 'warm' | 'cold'
        break
      default:
        if (def.mapsTo.startsWith('meta:')) {
          const key = def.mapsTo.slice('meta:'.length).replace(/[^a-zA-Z0-9_]/g, '_')
          if (key) meta_data[key] = value.slice(0, 5000)
        }
        break
    }
  }

  if (!name || !phone) {
    return { ok: false, error: 'Name and phone are required (add fields mapped to Name and Phone).' }
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Invalid email address' }
  }

  return {
    ok: true,
    payload: {
      name,
      phone,
      email,
      requirement,
      timeline,
      budget_range,
      interest_level,
      meta_data,
    },
  }
}
