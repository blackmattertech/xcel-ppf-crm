# Flows — Lead buckets

## Admin creates bucket

1. **Trigger:** Admin opens `/buckets` → New bucket
2. **Entry:** `POST /api/buckets`
3. **Service:** `createBucket()` → insert `lead_buckets`
4. **Auth:** admin / super_admin or `buckets.create`
5. **Exit:** Bucket appears in list with `lead_count: 0`

## Caller tags lead

1. **Trigger:** Open lead detail → Interests → Buckets
2. **Entry:** `LeadBucketPicker` loads `GET /api/buckets?active_only=true` + `GET /api/leads/[id]/buckets`
3. **Action:** Click bucket chip → `PUT /api/leads/[id]/buckets` with `bucketIds`
4. **Service:** `setLeadBuckets()` — delete old assignments, insert new rows in `lead_bucket_assignments`
5. **RBAC:** Tele-caller only if `leads.assigned_to = user.id`
6. **Failure:** Invalid/inactive bucket ID → 500 with message; UI reloads state
7. **Exit:** Chips reflect selection; lead status unchanged

## View bucket breakdown

1. **Trigger:** `/buckets` → click bucket row
2. **Entry:** `GET /api/buckets/[id]?include=leads`
3. **Response:** Lead name, phone, status, assignee; link to `/leads/[id]`
4. **Tele-caller:** Only assigned leads shown in detail panel

## Edge cases

| Case | Behavior |
|------|----------|
| Delete bucket | CASCADE removes assignments; leads untouched |
| Inactive bucket | Hidden from picker; existing assignments remain until user changes tags |
| Duplicate tag | Unique constraint prevents duplicate rows |
| Unassigned lead | Admin can tag; tele-caller cannot view unless assigned |

---

# Flows — WhatsApp automation

## Admin builds flow

1. **Trigger:** `/marketing/whatsapp/automation`
2. **Entry:** `POST /api/automation/whatsapp/flows` (max 2 active)
3. **Triggers:** `PUT .../flows/[id]/triggers` — day offset + template or text/image/video
4. **Exit:** Flow active; callers can enroll

## Caller enrolls lead

1. Lead detail → WhatsApp automation → pick flow → Enroll
2. `POST /api/automation/whatsapp/enrollments`
3. Day 0 batch queued if trigger exists
4. Cron sends messages on schedule (IST calendar days)

## Caller links bucket

1. `/buckets` → bucket detail → Link to flow
2. `POST /api/automation/whatsapp/bucket-links`
3. All current bucket leads enrolled; new tags auto-enroll via `setLeadBuckets` hook

## Cron processing

1. FastCron every 15 min → `GET /api/cron/whatsapp-automation`
2. `queueDueTriggerBatches()` → `advanceTriggerBatch()` in chunks
3. `remainingRecipients` persisted until all leads sent or permanent fail
4. Cycle end: `completed` or restart per `restart_on_complete`
