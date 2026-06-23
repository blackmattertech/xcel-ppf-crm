# Xcel PPF CRM — Overview

CRM for paint protection film (PPF) sales: leads, follow-ups, quotations, WhatsApp, telephony (Mcube), and reporting.

## Lead buckets (new)

Optional **labels** for leads — separate from journey **status**:

- **Admin** creates bucket names at `/buckets` (sidebar: Lead Buckets)
- **Admin & tele-callers** tag leads from lead detail → Interests → Buckets
- **Overview page** shows how many leads per bucket and drill-down lead list
- Does **not** change assignment, status, Meta `meta_data`, or round-robin

## Stack

- **Frontend:** Next.js App Router, React, Tailwind
- **Backend:** Next.js API routes, service layer in `backend/services/`
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth + role/permission tables

## Key folders

| Path | Purpose |
|------|---------|
| `app/` | Pages and API routes |
| `backend/services/` | Data access and business logic |
| `components/` | Shared UI |
| `database/migrations/` | SQL schema |
| `shared/constants/` | Roles, permissions, lead status |
| `docs/` | Engineering documentation |
