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
