import type { SupabaseClient } from '@supabase/supabase-js'

/** Must match upload-media / signed-url routes. Public so WhatsApp Cloud API can fetch document URLs. */
export const TEMPLATE_MEDIA_BUCKET = 'template-media'

/**
 * Ensures the WhatsApp/inbox storage bucket exists (fixes Supabase:
 * "The related resource does not exist" on signed upload when the bucket was never created).
 */
export async function ensureTemplateMediaBucket(
  supabase: SupabaseClient
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets()
  if (listErr) {
    return { ok: false, error: listErr.message }
  }
  if (buckets?.some((b) => b.name === TEMPLATE_MEDIA_BUCKET)) {
    return { ok: true }
  }

  const { error: createErr } = await supabase.storage.createBucket(TEMPLATE_MEDIA_BUCKET, {
    public: true,
    fileSizeLimit: 104857600, // 100 MB — WhatsApp document cap
  })

  if (!createErr) {
    return { ok: true }
  }

  const msg = createErr.message?.toLowerCase() ?? ''
  if (
    msg.includes('already exists') ||
    msg.includes('resource already exists') ||
    msg.includes('duplicate')
  ) {
    return { ok: true }
  }

  const { data: again } = await supabase.storage.listBuckets()
  if (again?.some((b) => b.name === TEMPLATE_MEDIA_BUCKET)) {
    return { ok: true }
  }

  return { ok: false, error: createErr.message }
}
