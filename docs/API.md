# API — Lead buckets

Base path: `/api/buckets` and `/api/leads/[id]/buckets`

Auth: session cookie via `requireAuth` / `requirePermission`.

## `GET /api/buckets`

List buckets.

| Query | Description |
|-------|-------------|
| `with_stats=true` | Returns `{ buckets, summary }` with `lead_count` per bucket |
| `active_only=true` | Only `is_active` buckets |

**Roles:** admin, super_admin, tele_caller (+ `buckets.read`)

## `POST /api/buckets`

Create bucket (admin only).

```json
{
  "name": "Hot PPF",
  "description": "High intent PPF leads",
  "color": "#6366f1",
  "sort_order": 0,
  "is_active": true
}
```

## `GET /api/buckets/[id]`

Single bucket. `?include=leads` returns `{ bucket, leads }` (tele-callers see only assigned leads).

## `PUT /api/buckets/[id]` / `DELETE /api/buckets/[id]`

Update / delete (admin).

## `GET /api/leads/[id]/buckets`

Buckets tagged on a lead. Requires `leads.read`. Tele-caller: own assigned leads only.

## `PUT /api/leads/[id]/buckets`

Replace lead's bucket tags. Requires `leads.update`.

```json
{ "bucketIds": ["uuid", "uuid"] }
```

Also accepts `bucket_ids` (snake_case).

**Note:** Does not modify `leads.status`, assignment, or `meta_data`.
