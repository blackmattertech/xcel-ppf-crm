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
