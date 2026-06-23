# Changelog

## 2026-06-23 — WhatsApp automation flows

**Feature:** Admin builds up to 2 active drip flows (1–30 days) with per-day template or text/image/video triggers. Callers enroll leads and link buckets; FastCron processes batches with chunked delivery until every lead is sent.

**Files:**
- `database/migrations/051_whatsapp_automation.sql`
- `backend/services/whatsapp-automation.service.ts`
- `backend/services/whatsapp-automation-processor.service.ts`
- `backend/jobs/whatsapp-automation.job.ts`
- `app/api/automation/whatsapp/**`, `app/api/cron/whatsapp-automation/route.ts`
- `app/marketing/whatsapp/automation/page.tsx`
- `components/whatsapp/LeadAutomationEnroll.tsx`, `BucketAutomationLinks.tsx`
- `shared/whatsapp-automation-types.ts`, `shared/whatsapp-automation-ist.ts`

**Documentation:** `docs/API.md`, `docs/FLOWS.md`, `docs/DATABASE.md`, `docs/DEPLOYMENT.md`, `docs/DEBUGGING.md`, `docs/FLOWCHARTS.md`

## 2026-06-23 — Automation image/video upload fix

**Bug fix:** Saving image or video automation triggers failed with `media_url or media_meta_id is required`.

**Cause:** Upload used raw multipart `fetch` (often no public URL); users could save before upload completed; sending requires `media_url` not Meta template handles.

**Fix:** Signed Supabase upload flow (same as templates), require `media_url` before save, clearer UI labels.

**Files:** `app/marketing/whatsapp/automation/page.tsx`, `backend/services/whatsapp-automation.service.ts`

## 2026-06-23 — Automation analytics accuracy fix

**Bug fix:** WhatsApp flow analytics under-counted or mis-dated sends.

**Causes:**
- Date filters used UTC midnight instead of IST (automation runs on IST calendar days)
- Supabase default 1000-row cap on `send_log` queries
- `send_log` upsert failed against partial unique index `(batch_id, lead_id)` so rows were never written
- Enrollment totals were all-time while sends were period-scoped (looked inconsistent)

**Fix:**
- `whatsapp-automation-analytics.service.ts` — IST period boundaries, paginated send_log fetch, batch `run_date` filter, fallback from `result_json` when logs missing
- `whatsapp-automation-processor.service.ts` — update-then-insert for `send_log` instead of upsert
- Analytics UI — IST default date range, clearer period labels

**Documentation:** `docs/API.md`, `docs/DEBUGGING.md`

## 2026-06-23 — Automation flow analytics

**Feature:** Analytics dashboard at `/marketing/whatsapp/automation/analytics` — enrollments, sends over time, per trigger day stats, recent failures.

**API:** `GET /api/automation/whatsapp/analytics?flowId=`

## 2026-06-23 — Cron jobs: FastCron

**Change:** All scheduled HTTP tasks use FastCron (`docs/DEPLOYMENT.md`). Removed `render.yaml` and GitHub Actions workflows.

**Jobs:** `whatsapp-process-scheduled` (5m), `meta-leads-sync` (6h), `whatsapp-automation` (15m), `whatsapp-template-sync` (1h).

## 2026-06-23 — Lead Buckets

**Feature:** Admin can create lead bucket names; callers and admins tag leads into buckets without affecting status or journey.

**Files:**
- `database/migrations/050_lead_buckets.sql` — schema + permissions
- `backend/services/lead-bucket.service.ts` — bucket CRUD and lead tagging
- `app/api/buckets/route.ts`, `app/api/buckets/[id]/route.ts`
- `app/api/leads/[id]/buckets/route.ts`
- `app/buckets/page.tsx`, `app/buckets/[id]/page.tsx`
- `app/leads/LeadDetailPageContent.tsx` — bucket chips in Interests section
- `shared/constants/sidebar.ts`, `shared/constants/permissions.ts`

**Documentation:** `docs/LEAD_BUCKETS.md`

**Migration required:** Yes — run `050_lead_buckets.sql`
