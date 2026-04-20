/**
 * Ingest one Google Sheet row (Meta Lead Ads export shape) into public.leads.
 * Auth: Authorization: Bearer <SHEETS_SYNC_SECRET> (set in Supabase Edge Function secrets).
 * Deploy with JWT verification disabled for this function, or use --no-verify-jwt.
 */
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
}

const LEAD_SOURCES = ["meta", "manual", "form"] as const
type LeadSource = (typeof LEAD_SOURCES)[number]

const ASSIGNABLE_LEAD_ROLES = ["tele_caller", "sales", "sales_manager", "sales_executive"]

const EPOCH = new Date(1970, 0, 1).toISOString()

/** DB leads_status_check (migration 011) — sheet values outside this map to `new`. */
const ALLOWED_LEAD_STATUSES = new Set([
  "new",
  "contacted",
  "qualified",
  "unqualified",
  "quotation_shared",
  "quotation_viewed",
  "quotation_accepted",
  "quotation_expired",
  "interested",
  "negotiation",
  "lost",
  "discarded",
  "converted",
  "deal_won",
  "payment_pending",
  "advance_received",
  "fully_paid",
])

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function cleanPhone(raw: string): string {
  let s = String(raw ?? "").trim()
  s = s.replace(/^(p|tel|phone|mobile):/i, "").trim()
  return s
}

function stripMetaTypePrefix(value: string | null | undefined): string | null {
  if (value == null || value === "") return null
  const s = String(value).trim()
  const m = s.match(/^[a-z]{1,2}:(.+)$/i)
  return m ? m[1].trim() : s
}

function generateLeadId(): string {
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").split(".")[0]
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `LEAD-${timestamp}-${randomSuffix}`
}

function getInterestedProductFromMeta(metaData: Record<string, unknown>): string {
  const directKeys = [
    "what_services_are_you_looking_for?",
    "what_services_are_you_looking_for",
    "what_services_you're_looking_for?",
    "what_services_you're_looking_for",
    "What services are you looking for?",
    "what service you are looking for?",
    "what service you are looking for",
    "What service are you looking for?",
    "product_interest",
    "service",
    "interested_product",
  ]
  for (const key of directKeys) {
    const val = metaData[key]
    if (val && typeof val === "string") return String(val).replace(/_/g, " ")
  }
  const fieldData = metaData.field_data
  if (Array.isArray(fieldData)) {
    const serviceFieldNames = [
      "what_services_are_you_looking_for",
      "what services are you looking for",
      "what_service_are_you_looking_for",
      "what_services_you're_looking_for",
      "product_interest",
      "service",
      "product",
      "interested_product",
    ]
    for (const field of fieldData as Array<{ name?: string; values?: string[] }>) {
      const name = (field?.name || "").toLowerCase().replace(/_/g, " ")
      const value = field?.values?.[0]
      if (value && serviceFieldNames.some((fn) => name.includes(fn.replace(/_/g, " ")))) {
        return String(value).replace(/_/g, " ")
      }
    }
  }
  return ""
}

function getCarModelFromMeta(metaData: Record<string, unknown>): string {
  const directKeys = [
    "car_model",
    "Car Model",
    "vehicle_model",
    "Vehicle Model",
    "which_car_do_you_have?",
    "which_car_do_you_have",
    "Which car do you have?",
  ]
  for (const key of directKeys) {
    const val = metaData[key]
    if (val && typeof val === "string") return String(val).replace(/_/g, " ")
  }
  const fieldData = metaData.field_data
  if (Array.isArray(fieldData)) {
    const carFieldNames = [
      "car_model",
      "car model",
      "vehicle_model",
      "which_car_do_you_have",
      "which car do you have",
    ]
    for (const field of fieldData as Array<{ name?: string; values?: string[] }>) {
      const name = (field?.name || "").toLowerCase()
      const value = field?.values?.[0]
      if (value && carFieldNames.some((fn) => name.includes(fn))) {
        return String(value).replace(/_/g, " ")
      }
    }
  }
  return ""
}

function buildRequirementFromMeta(metaData: Record<string, unknown>): string {
  const service = getInterestedProductFromMeta(metaData)
  const carModel = getCarModelFromMeta(metaData)
  const parts: string[] = []
  if (service) parts.push(service)
  if (carModel) parts.push(`Car Model: ${carModel}`)
  return parts.join(" | ")
}

function mapSheetLeadStatus(raw: unknown): string {
  if (raw == null || String(raw).trim() === "") return "new"
  const s = String(raw).trim().toLowerCase()
  if (s === "created" || s === "new") return "new"
  if (ALLOWED_LEAD_STATUSES.has(s)) return s
  return "new"
}

async function getAssignableUserIds(
  supabase: SupabaseClient,
  excludeUserId?: string,
  requireReceivesNewLeads = true,
): Promise<string[]> {
  const { data: roles, error: rolesError } = await supabase.from("roles").select("id").in("name", [...ASSIGNABLE_LEAD_ROLES])
  if (rolesError || !roles?.length) return []
  const roleIds = (roles as { id: string }[]).map((r) => r.id)
  let query = supabase.from("users").select("id").in("role_id", roleIds)
  if (requireReceivesNewLeads) {
    query = query.eq("receives_new_lead_assignments", true)
  }
  if (excludeUserId) query = query.neq("id", excludeUserId)
  const { data: users, error: usersError } = await query
  if (usersError || !users?.length) return []
  return (users as { id: string }[]).map((u) => u.id)
}

async function assignLeadRoundRobin(supabase: SupabaseClient, leadSource: LeadSource): Promise<string | null> {
  const userIds = await getAssignableUserIds(supabase)
  if (userIds.length === 0) {
    console.error("[sheets-meta-lead] No assignable users for round-robin")
    return null
  }

  const { data: assignmentsForSource, error: assignmentsError } = await supabase
    .from("assignments")
    .select("user_id")
    .eq("lead_source", leadSource)
    .in("user_id", userIds)

  if (assignmentsError) {
    throw new Error(`Failed to fetch assignments: ${assignmentsError.message}`)
  }

  const existingUserIds = new Set((assignmentsForSource as { user_id: string }[] | null)?.map((a) => a.user_id) ?? [])
  const missingUserIds = userIds.filter((id) => !existingUserIds.has(id))
  if (missingUserIds.length > 0) {
    const newRows = missingUserIds.map((userId) => ({
      user_id: userId,
      lead_source: leadSource,
      last_assigned_at: EPOCH,
      assignment_count: 0,
    }))
    const { error: insertError } = await supabase.from("assignments").insert(newRows)
    if (insertError) {
      console.error(`[sheets-meta-lead] assignment insert: ${insertError.message}`)
    }
  }

  const { data: allAssignments } = await supabase
    .from("assignments")
    .select("user_id, lead_source")
    .in("user_id", userIds)
    .in("lead_source", [...LEAD_SOURCES])

  const existingByUserAndSource = new Set(
    (allAssignments as { user_id: string; lead_source: string }[] | null)?.map((a) => `${a.user_id}:${a.lead_source}`) ??
      [],
  )
  const toInsert: Array<{
    user_id: string
    lead_source: string
    last_assigned_at: string
    assignment_count: number
  }> = []
  for (const userId of userIds) {
    for (const source of LEAD_SOURCES) {
      if (!existingByUserAndSource.has(`${userId}:${source}`)) {
        toInsert.push({
          user_id: userId,
          lead_source: source,
          last_assigned_at: EPOCH,
          assignment_count: 0,
        })
      }
    }
  }
  if (toInsert.length > 0) {
    const { error: bulkInsertError } = await supabase.from("assignments").insert(toInsert)
    if (bulkInsertError) {
      console.error(`[sheets-meta-lead] assignment backfill: ${bulkInsertError.message}`)
    }
  }

  const { data: allAssignmentsForSource, error: allAssignmentsError } = await supabase
    .from("assignments")
    .select("id, user_id, assignment_count, last_assigned_at")
    .eq("lead_source", leadSource)
    .in("user_id", userIds)
    .order("last_assigned_at", { ascending: true })
    .order("assignment_count", { ascending: true })
    .limit(1)

  if (allAssignmentsError || !allAssignmentsForSource?.length) return null

  const selected = allAssignmentsForSource[0] as {
    id: string
    user_id: string
    assignment_count: number
    last_assigned_at: string
  }

  await supabase
    .from("assignments")
    .update({
      last_assigned_at: new Date().toISOString(),
      assignment_count: (selected.assignment_count || 0) + 1,
    })
    .eq("id", selected.id)

  return selected.user_id
}

function rowToMetaData(row: Record<string, unknown>): Record<string, unknown> {
  const meta: Record<string, unknown> = { google_sheet_sync: true }
  for (const [k, v] of Object.entries(row)) {
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      meta[k] = v
    }
  }
  const rawId = row.id != null ? String(row.id) : ""
  if (rawId) {
    meta.meta_lead_id = stripMetaTypePrefix(rawId) ?? rawId
    meta.sheet_row_id = rawId
  }
  return meta
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405)
  }

  const expectedSecret = Deno.env.get("SHEETS_SYNC_SECRET")?.trim()
  if (!expectedSecret) {
    return jsonResponse({ error: "SHEETS_SYNC_SECRET is not configured on this function" }, 500)
  }

  const auth = req.headers.get("authorization")?.trim() ?? ""
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : ""
  if (!token || token !== expectedSecret) {
    return jsonResponse({ error: "Unauthorized" }, 401)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let row: Record<string, unknown>
  try {
    row = (await req.json()) as Record<string, unknown>
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400)
  }

  const phoneRaw = row.phone_number ?? row.phone ?? row.Phone
  const phone = cleanPhone(phoneRaw != null ? String(phoneRaw) : "")
  if (!phone) {
    return jsonResponse({ error: "Missing or empty phone (phone_number / phone)" }, 400)
  }

  const nameRaw = row.full_name ?? row.name ?? row.Full_Name
  const name = String(nameRaw ?? "").trim() || "Unknown"

  const emailRaw = row.email
  const email = emailRaw != null && String(emailRaw).trim() !== "" ? String(emailRaw).trim() : null

  const metaData = rowToMetaData(row)
  const requirement = buildRequirementFromMeta(metaData) || null

  const status = mapSheetLeadStatus(row.lead_status ?? row.lead_Status)

  const campaign_id = stripMetaTypePrefix(row.campaign_id != null ? String(row.campaign_id) : null)
  const ad_id = stripMetaTypePrefix(row.ad_id != null ? String(row.ad_id) : null)
  const adset_id = stripMetaTypePrefix(row.adset_id != null ? String(row.adset_id) : null)
  const form_id = stripMetaTypePrefix(row.form_id != null ? String(row.form_id) : null)
  const form_name = row.form_name != null ? String(row.form_name) : null
  const ad_name = row.ad_name != null ? String(row.ad_name) : null
  const campaign_name = row.campaign_name != null ? String(row.campaign_name) : null

  const leadPayload = {
    name,
    phone,
    email,
    source: "meta" as const,
    campaign_id,
    ad_id,
    adset_id,
    form_id,
    form_name,
    ad_name,
    campaign_name,
    meta_data: metaData,
    requirement,
    status,
  }

  const { data: existing, error: existingErr } = await supabase.from("leads").select("id, lead_id").eq("phone", phone).maybeSingle()

  if (existingErr) {
    return jsonResponse({ error: existingErr.message }, 500)
  }

  const nowIso = new Date().toISOString()

  if (existing) {
    const existingRow = existing as { id: string; lead_id: string }
    const { data: updated, error: updErr } = await supabase
      .from("leads")
      .update({
        ...leadPayload,
        updated_at: nowIso,
      })
      .eq("id", existingRow.id)
      .select("id, lead_id, phone, status")
      .single()

    if (updErr) {
      return jsonResponse({ error: updErr.message }, 500)
    }
    return jsonResponse({ ok: true, action: "updated", lead: updated }, 200)
  }

  let assigned_to: string | null = null
  try {
    assigned_to = await assignLeadRoundRobin(supabase, "meta")
  } catch (e) {
    console.error("[sheets-meta-lead] assignLeadRoundRobin:", e)
  }

  const lead_id = generateLeadId()
  const { data: inserted, error: insErr } = await supabase
    .from("leads")
    .insert({
      ...leadPayload,
      lead_id,
      assigned_to,
    })
    .select("id, lead_id, phone, status, assigned_to")
    .single()

  if (insErr) {
    return jsonResponse({ error: insErr.message }, 500)
  }

  const created = inserted as { id: string; assigned_to: string | null; status: string }
  if (created.assigned_to) {
    const { error: histErr } = await supabase.from("lead_status_history").insert({
      lead_id: created.id,
      old_status: null,
      new_status: created.status,
      changed_by: created.assigned_to,
    })
    if (histErr) {
      console.error("[sheets-meta-lead] lead_status_history:", histErr.message)
    }
  }

  return jsonResponse({ ok: true, action: "created", lead: inserted }, 201)
})
