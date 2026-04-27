/**
 * Supabase Edge Function: process scheduled WhatsApp broadcasts.
 * Run by pg_cron every minute. Reads due jobs from scheduled_broadcasts,
 * gets WhatsApp config from whatsapp_business_settings (or env), sends via Meta API.
 *
 * For large lists (100+), prefer the Next.js route instead — it chunks, persists progress in
 * `result_json.broadcastProgress`, retries failures, and writes `whatsapp_messages`:
 * GET /api/marketing/whatsapp/process-scheduled?secret=...
 */
import { createClient } from "npm:@supabase/supabase-js@2"

const META_GRAPH = "https://graph.facebook.com/v21.0"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
}

function toE164(phone: string, defaultCountryCode = "91"): string {
  const digits = phone.replace(/\D/g, "").trim()
  if (digits.length === 0) return ""
  if (digits.length <= 10 && defaultCountryCode) {
    const cc = defaultCountryCode.replace(/\D/g, "")
    if (cc.length >= 1) return `${cc}${digits}`
  }
  return digits
}

function toMetaTo(digits: string): string {
  return digits.startsWith("+") ? digits : `+${digits}`
}

function normLang(code: string): string {
  const s = (code || "en").replace(/-/g, "_").trim()
  return /^[a-z]{2,3}(_[a-zA-Z0-9]{2,4})?$/.test(s) ? s : "en"
}

interface ResolvedPayload {
  templateName: string
  templateLanguage: string
  recipients: Array<{ phone: string; bodyParameters?: string[] }>
  delayMs?: number
  defaultCountryCode?: string
  headerParameters?: string[]
  headerFormat?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT"
}

function buildTemplateComponents(payload: ResolvedPayload): Record<string, unknown>[] {
  const components: Record<string, unknown>[] = []
  const headerFormat = payload.headerFormat ?? "TEXT"
  const headerParams = payload.headerParameters ?? []

  if (headerFormat === "TEXT" && headerParams.length > 0) {
    components.push({
      type: "header",
      parameters: headerParams.map((text: string) => ({ type: "text", text })),
    })
  } else if (["IMAGE", "VIDEO", "DOCUMENT"].includes(headerFormat) && headerParams.length > 0) {
    const value = headerParams[0].trim()
    const linkUrl = value.startsWith("http://") || value.startsWith("https://") || value.startsWith("www.")
      ? (value.startsWith("www.") ? "https://" + value : value)
      : value.includes("://")
        ? value
        : "https://" + value
    if (headerFormat === "IMAGE") {
      components.push({ type: "header", parameters: [{ type: "image", image: { link: linkUrl } }] })
    } else if (headerFormat === "VIDEO") {
      components.push({ type: "header", parameters: [{ type: "video", video: { link: linkUrl } }] })
    } else {
      components.push({ type: "header", parameters: [{ type: "document", document: { link: linkUrl } }] })
    }
  }

  const bodyParams = payload.recipients[0]?.bodyParameters
  if (bodyParams && bodyParams.length > 0) {
    components.push({
      type: "body",
      parameters: bodyParams.map((text: string) => ({ type: "text", text })),
    })
  }

  return components
}

async function sendOneTemplate(
  config: { phoneNumberId: string; accessToken: string },
  to: string,
  payload: ResolvedPayload,
  bodyParams: string[]
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const digits = toE164(to, payload.defaultCountryCode ?? "91")
  if (digits.length < 10) return { success: false, error: "Invalid phone" }

  const components = buildTemplateComponents({
    ...payload,
    recipients: [{ phone: to, bodyParameters: bodyParams }],
  })
  const code = normLang(payload.templateLanguage)
  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toMetaTo(digits),
    type: "template",
    template: {
      name: (payload.templateName || "").trim(),
      language: { code },
      components: components.length > 0 ? components : undefined,
    },
  }

  const res = await fetch(`${META_GRAPH}/${config.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.accessToken}`,
    },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as {
    messages?: Array<{ id: string }>
    error?: { message: string }
  }

  if (!res.ok) {
    return { success: false, error: data?.error?.message ?? `HTTP ${res.status}` }
  }
  return { success: true, messageId: data?.messages?.[0]?.id }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const now = new Date().toISOString()
    const { data: jobs, error: fetchErr } = await supabase
      .from("scheduled_broadcasts")
      .select("id, scheduled_at, payload_json, created_by")
      .eq("status", "pending")
      .lte("scheduled_at", now)
      .order("scheduled_at", { ascending: true })
      .limit(5)

    if (fetchErr) {
      if (fetchErr.code === "42P01") {
        return new Response(
          JSON.stringify({ error: "scheduled_broadcasts table not found. Run migration 031." }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }
      return new Response(
        JSON.stringify({ error: fetchErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const rows = (jobs ?? []) as Array<{
      id: string
      scheduled_at: string
      payload_json: ResolvedPayload | null
      created_by: string | null
    }>

    if (rows.length === 0) {
      const { count: pendingCount } = await supabase
        .from("scheduled_broadcasts")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending")
      const { count: dueCount } = await supabase
        .from("scheduled_broadcasts")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending")
        .lte("scheduled_at", now)
      const message =
        (dueCount ?? 0) === 0 && (pendingCount ?? 0) > 0
          ? "No due jobs yet. You have pending jobs scheduled for a future time."
          : "No due jobs to process."
      return new Response(
        JSON.stringify({
          processed: 0,
          message,
          debug: { pendingCount: pendingCount ?? 0, dueCount: dueCount ?? 0 },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const results: Array<{ id: string; status: string; sent?: number; failed?: number; error?: string }> = []

    for (const job of rows) {
      const payload = job.payload_json
      if (!payload?.templateName || !Array.isArray(payload.recipients) || payload.recipients.length === 0) {
        await supabase
          .from("scheduled_broadcasts")
          .update({
            status: "failed",
            error_message: "Invalid payload: missing templateName or recipients",
            completed_at: new Date().toISOString(),
          })
          .eq("id", job.id)
        results.push({ id: job.id, status: "failed", error: "Invalid payload" })
        continue
      }

      await supabase
        .from("scheduled_broadcasts")
        .update({ status: "processing", started_at: new Date().toISOString() })
        .eq("id", job.id)

      let config: { phoneNumberId: string; accessToken: string } | null = null
      if (job.created_by) {
        const { data: settings } = await supabase
          .from("whatsapp_business_settings")
          .select("phone_number_id, access_token")
          .eq("created_by", job.created_by)
          .eq("is_active", true)
          .maybeSingle()
        if (settings?.phone_number_id && settings?.access_token) {
          config = {
            phoneNumberId: (settings as { phone_number_id: string }).phone_number_id.trim(),
            accessToken: (settings as { access_token: string }).access_token.trim(),
          }
        }
      }
      if (!config) {
        const phoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")
        const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN")
        if (phoneId && token) config = { phoneNumberId: phoneId.trim(), accessToken: token.trim() }
      }

      if (!config) {
        await supabase
          .from("scheduled_broadcasts")
          .update({
            status: "failed",
            error_message: "WhatsApp API not configured (link in app Settings or set Edge Function secrets)",
            completed_at: new Date().toISOString(),
          })
          .eq("id", job.id)
        results.push({ id: job.id, status: "failed", error: "WhatsApp not configured" })
        continue
      }

      const delayMs = Math.min(60000, Math.max(0, payload.delayMs ?? 250))
      let sent = 0
      let failed = 0
      const jobResults: Array<{ phone: string; success: boolean; error?: string }> = []
      const bodyParams = payload.recipients[0]?.bodyParameters ?? []

      for (const r of payload.recipients) {
        const result = await sendOneTemplate(config, r.phone, payload, r.bodyParameters ?? bodyParams)
        jobResults.push({ phone: r.phone, success: result.success, error: result.error })
        if (result.success) sent++
        else failed++
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
      }

      await supabase
        .from("scheduled_broadcasts")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          result_json: { sent, failed, results: jobResults },
        })
        .eq("id", job.id)

      results.push({ id: job.id, status: "completed", sent, failed })
    }

    return new Response(
      JSON.stringify({ processed: results.length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
