# Lead Buckets

## Overview

Lead buckets let admins define named groups (e.g. "Hot PPF", "Follow up next week"). Tele-callers and admins tag leads into one or more buckets from the lead detail panel. Buckets are **separate** from lead status, journey, and assignment — tagging does not change any other CRM process.

## Database

Migration: `database/migrations/050_lead_buckets.sql`

| Table | Purpose |
|-------|---------|
| `lead_buckets` | Admin-defined bucket catalog (name, color, sort order, active flag) |
| `lead_bucket_assignments` | Many-to-many junction: `lead_id` ↔ `bucket_id` |

## API

| Method | URL | Who | Description |
|--------|-----|-----|-------------|
| GET | `/api/buckets?with_stats=true` | Admin, tele-caller | List buckets with lead counts |
| GET | `/api/buckets?active_only=true` | Authenticated + `lead_buckets.read` | Active buckets for picker |
| POST | `/api/buckets` | Admin | Create bucket |
| GET | `/api/buckets/[id]?with_leads=true` | Admin, tele-caller | Bucket detail + leads |
| PUT | `/api/buckets/[id]` | Admin | Update bucket |
| DELETE | `/api/buckets/[id]` | Admin | Delete bucket (untags leads) |
| GET | `/api/leads/[id]/buckets` | `leads.read` | Buckets on a lead |
| PUT | `/api/leads/[id]/buckets` | `leads.update` | Replace bucket tags `{ bucket_ids: string[] }` |

Tele-callers may only tag leads **assigned to them**.

## UI

| Page | Path | Description |
|------|------|-------------|
| Bucket overview | `/buckets` | Counts per bucket, admin create/edit, link to detail |
| Bucket detail | `/buckets/[id]` | All leads in bucket (tele-caller sees assigned only) |
| Lead tagging | Lead detail → Interests → Buckets | Toggle chips to tag/untag |

## Permissions

Resource: `lead_buckets` (sidebar item **Lead Buckets**)

- Admin: full CRUD
- Tele-caller: `lead_buckets.read` + tag via `leads.update`

## Deploy

Run migration `050_lead_buckets.sql` against Supabase before using buckets in production.
