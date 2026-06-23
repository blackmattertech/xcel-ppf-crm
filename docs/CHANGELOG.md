# Changelog

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
