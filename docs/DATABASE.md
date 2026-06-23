# Database — Lead buckets

## Tables

### `lead_buckets`

Admin-defined bucket catalog. Does **not** replace `leads.status` (journey).

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `name` | TEXT UNIQUE | Display name |
| `description` | TEXT | Optional |
| `color` | TEXT | Hex color for UI chips |
| `sort_order` | INTEGER | List ordering |
| `is_active` | BOOLEAN | Inactive buckets hidden from tagging |
| `created_by` | UUID → users | |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

### `lead_bucket_assignments`

Many-to-many: leads ↔ buckets.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `lead_id` | UUID → leads ON DELETE CASCADE | |
| `bucket_id` | UUID → lead_buckets ON DELETE CASCADE | |
| `assigned_by` | UUID → users | Who tagged |
| `created_at` | TIMESTAMPTZ | |

**Unique:** `(lead_id, bucket_id)`

## Migration

`database/migrations/050_lead_buckets.sql`

**Rollback:** Drop `lead_bucket_assignments`, then `lead_buckets`; remove `buckets.*` permissions from `role_permissions` and `permissions`.

## Query patterns

- Bucket counts: `SELECT bucket_id, COUNT(*) FROM lead_bucket_assignments GROUP BY bucket_id`
- Leads in bucket: join `lead_bucket_assignments` → `leads` on `lead_id`
- Tele-caller scope: filter `leads.assigned_to = current_user_id` when listing bucket leads

---

## WhatsApp automation (migration `051`)

| Table | Purpose |
|-------|---------|
| `whatsapp_automation_flows` | Named loops, cycle_days 1–30, restart_on_complete |
| `whatsapp_automation_triggers` | Per-day messages (template/text/image/video) |
| `whatsapp_automation_bucket_links` | Bucket ↔ flow auto-enroll rule |
| `whatsapp_automation_lead_enrollments` | Per-lead enrollment + cycle_number |
| `whatsapp_automation_trigger_batches` | Chunked send jobs with `broadcastProgress` |
| `whatsapp_automation_send_log` | Per-lead delivery audit |

**Migration:** `database/migrations/051_whatsapp_automation.sql`

---

## MCube failed-call WhatsApp (migration `052`)

### `mcube_settings` (extended)

| Column | Type | Notes |
|--------|------|-------|
| `failed_call_whatsapp_enabled` | BOOLEAN | Master switch |
| `failed_call_whatsapp_template_id` | UUID → whatsapp_templates | Approved template |
| `failed_call_whatsapp_body_parameters` | JSONB | Array of strings; `{{lead_name}}` token |
| `failed_call_whatsapp_header_parameters` | JSONB | Optional header params |

### `mcube_failed_call_whatsapp_log`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `call_id` | UUID → calls | Nullable on call delete |
| `mcube_call_id` | TEXT UNIQUE | Idempotency key |
| `lead_id` | UUID → leads | |
| `template_id` | UUID → whatsapp_templates | |
| `status` | TEXT | `sent` \| `failed` |
| `wamid`, `error`, `dial_status` | TEXT | Audit |
| `created_at` | TIMESTAMPTZ | |

**Migration:** `database/migrations/052_mcube_failed_call_whatsapp.sql`
