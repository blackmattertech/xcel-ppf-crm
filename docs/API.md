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

## `GET /api/reports/buckets`

Bucket analytics for Reports page.

**Response:**
```json
{
  "summary": {
    "total_buckets": 3,
    "active_buckets": 3,
    "unique_leads_tagged": 42,
    "total_leads_in_system": 100,
    "untagged_leads": 58,
    "total_assignments": 45
  },
  "buckets": [{ "id": "...", "name": "...", "lead_count": 12, "color": "#dd3f3c" }]
}
```

**Auth:** admin, `reports.read`, or `buckets.read`

**Note:** Does not modify `leads.status`, assignment, or `meta_data`.

## `GET /api/reports/daily-calls`

MCUBE call report for Reports → Call reports tab.

| Query | Description |
|-------|-------------|
| `start` | ISO datetime (start of from day, local → UTC) |
| `end` | ISO datetime (end of to day) |
| `user_id` | Optional UUID — admin/marketing filter by caller |

**Max range:** 30 calendar days (inclusive).

**Auth:** `reports.read` or admin. Tele-callers with `reports.read` see only their own calls.

---

# API — WhatsApp automation

Base: `/api/automation/whatsapp/*` and cron `/api/cron/whatsapp-automation`

## Flows (admin)

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/automation/whatsapp/flows` | `whatsapp_automation.read` |
| POST | `/api/automation/whatsapp/flows` | `whatsapp_automation.manage` |
| GET/PUT/DELETE | `/api/automation/whatsapp/flows/[id]` | read / manage |
| PUT | `/api/automation/whatsapp/flows/[id]/triggers` | manage — replace trigger set |

**Limits:** max 2 active flows; `cycle_days` 1–30; triggers on days `0 … cycle_days-1`.

**Trigger `message_type`:** `template` | `text` | `image` | `video`

## Enrollments (callers)

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/automation/whatsapp/enrollments?leadId=` | read |
| POST | `/api/automation/whatsapp/enrollments` | `whatsapp_automation.enroll` or `leads.update` |
| DELETE | `/api/automation/whatsapp/enrollments?enrollmentId=` | enroll |

Body (POST): `{ "flow_id", "lead_id" }`

## Bucket links

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/automation/whatsapp/bucket-links?bucketId=` | read |
| POST | `/api/automation/whatsapp/bucket-links` | enroll — `{ flow_id, bucket_id }` |
| DELETE | `?flowId=&bucketId=` | enroll |

| GET | `/api/automation/whatsapp/analytics?flowId=&startDate=&endDate=` | read — enrollments, sends, per-day stats (IST calendar dates; `startDate`/`endDate` as `YYYY-MM-DD` in Asia/Kolkata) |

## Logs (admin)

`GET /api/automation/whatsapp/logs?flowId=&limit=`

## Cron (FastCron)

All schedulers use `Authorization: Bearer CRON_SECRET`. Configure in [`docs/DEPLOYMENT.md`](DEPLOYMENT.md).

| Endpoint | Schedule |
|----------|----------|
| `GET /api/cron/whatsapp-process-scheduled` | every 5 min |
| `GET /api/cron/meta-leads-sync` | every 6 h |
| `GET /api/cron/whatsapp-automation` | every 15 min |
| `GET /api/cron/whatsapp-template-sync` | hourly |

Manual: `GET /api/marketing/whatsapp/process-automation?secret=`

## MCube settings (admin)

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/integrations/mcube/settings` | authenticated |
| PUT | `/api/integrations/mcube/settings` | admin / super_admin |

**PUT body (partial):**

```json
{
  "hideConnectedWhenLastMcubeNotConnected": true,
  "failedCallWhatsappEnabled": true,
  "failedCallWhatsappTemplateId": "<uuid>",
  "failedCallWhatsappBodyParameters": ["{{lead_name}}"],
  "failedCallWhatsappHeaderParameters": []
}
```

When `failedCallWhatsappEnabled` is true, failed **outbound** MCube hangups (`not_reachable`) trigger automatic WhatsApp template send via webhook handler.

