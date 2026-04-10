# Client Proposal: WhatsApp-Style Inbox Integration

## Project Goal

Build an Inbox inside your CRM where your team can chat with customers in a WhatsApp-like experience:

- send and receive normal messages
- send attachments (images, videos, documents)
- view message status (sent, delivered, read)
- manage all conversations from one place

This document is client-friendly and focused on deliverables, timeline, and pricing.

---

## What You Will Get (MVP)

### 1) Inbox Screen
- Conversation list (left side) with latest message and unread count
- Chat window (right side) with full history
- Search by customer name or phone number

### 2) Messaging
- Send/receive text messages
- Real-time updates (new message appears automatically)
- Message timestamps
- Message status: sent, delivered, read, failed

### 3) Attachments
- Send and view images
- Send and view videos
- Send and download documents (PDF and supported file types)
- File size/type validation for safe uploads

### 4) Team Access
- Login-based access
- Permission control (who can view/send)
- Basic activity tracking

### 5) Reliability
- Error handling and retry support
- Webhook processing for incoming messages/status updates
- Basic monitoring logs for production support

---

## Optional Add-Ons (Not in MVP)

- Chat assignment to specific team members
- Quick reply templates in chat
- Message reactions
- Voice note support
- Multi-channel inbox (Instagram, Facebook Messenger, etc.)
- Advanced analytics dashboard (response time, agent performance)

---

## Timeline

### Standard Delivery
**6 to 8 weeks**

- Week 1-2: UI + core conversation APIs
- Week 3-4: text messaging + real-time updates
- Week 5-6: attachments + status tracking + QA
- Week 7-8: UAT fixes + production rollout (if needed)

### Fast-Track Delivery
**4 to 5 weeks** (with tight feedback cycle and fast approvals)

---

## Pricing (INR)

## Package A: MVP Inbox Integration
**INR 3,25,000 fixed**

Includes:
- Inbox UI
- text messaging
- image/video/document attachments
- read/delivered status
- role-based access
- testing + production deployment support

## Package B: MVP + Assignment + Quick Replies
**INR 4,10,000 fixed**

Includes everything in Package A, plus:
- conversation assignment to agents
- quick reply/canned responses
- inbox filters (assigned, unread, resolved)

## Package C: Advanced Inbox (Phase 2 Included)
**INR 5,40,000 fixed**

Includes everything in Package B, plus:
- advanced analytics
- performance optimization for high message volume
- enhanced admin controls

---

## Monthly Support (After Go-Live)

Choose one:

- **Basic Support:** INR 25,000/month  
  (bug fixes, monitoring, small adjustments)

- **Priority Support:** INR 45,000/month  
  (faster SLA, priority fixes, minor feature updates)

---

## Commercial Terms

- 40% advance to start
- 40% after staging/UAT sign-off
- 20% after production go-live

### Assumptions

- Existing WhatsApp Business API access is available and active
- Client provides required API credentials and approvals on time
- Any third-party cost (Meta/WhatsApp usage, cloud storage, hosting upgrades) is billed separately
- Scope changes beyond agreed package will be estimated separately

---

## Deliverables

At project completion, client receives:

- fully integrated Inbox module in CRM
- deployment in agreed environment
- admin/user usage guide (short document)
- handover session (knowledge transfer)
- post-launch support during warranty period

---

## Warranty

**30 days bug-fix warranty** after go-live (for delivered scope).

---

## Next Step

Client can choose one package (A/B/C), confirm timeline preference (standard or fast-track), and we can begin with a kickoff + final scope lock.

# Inbox Feature Roadmap (WhatsApp-Like)

## 1) Problem Statement

### Issue

The codebase already has WhatsApp messaging pieces (chat UI, send API, webhook ingestion, template media upload), but not a unified inbox feature comparable to WhatsApp where users can:

- view all conversations in one inbox
- send and receive normal messages in real time
- attach and view images, videos, documents, and other media
- rely on delivery/read states and stable message history

### Why this is happening

The current implementation evolved around marketing workflows first (templates, broadcast, WhatsApp API integration), so inbox behavior is distributed across multiple routes/services with a mostly text-centric storage model.

### Resolution

Build a dedicated Inbox domain on top of current infrastructure (Next.js + Supabase + existing WhatsApp integrations), with:

- conversation-centric data model
- typed message payloads for text/media/documents
- robust upload/download flow
- role-based access + auditability
- phased rollout with measurable milestones

---

## 2) Current Codebase Findings (What already exists)

- **Chat UI (lead-based):** `app/marketing/chat/page.tsx`
- **Fetch conversation API:** `app/api/marketing/whatsapp/chat/route.ts`
- **Send text API + persistence:** `app/api/marketing/whatsapp/send/route.ts`
- **Incoming + status webhook handling:** `app/api/webhooks/whatsapp/route.ts`
- **Chat storage service:** `backend/services/whatsapp-chat.service.ts`
- **Media upload endpoint (Meta + Supabase storage):** `app/api/marketing/whatsapp/upload-media/route.ts`
- **Supabase realtime usage already present:** `app/marketing/chat/page.tsx`
- **Current table for chat history:** `whatsapp_messages` (typed in `shared/types/database.ts`)

### Gaps to close for WhatsApp-like Inbox

- no explicit `conversations` table for inbox list (last message, unread count, assignee)
- `whatsapp_messages` is text-first (missing first-class content types + metadata for attachments)
- no unified attachment metadata model (mime, size, thumb, duration, filename, encryption/hash fields)
- no inbox-level endpoints (list conversations, mark read, typing/presence, pagination cursors)
- current chat UI is lead-selector oriented, not full inbox UX

---

## 3) Target Scope (MVP vs Later)

## MVP (must-have)

- conversation list + conversation screen
- send/receive text
- send/receive image, video, document
- message status: sent/delivered/read/failed
- unread counts and mark-as-read
- search by name/phone/message
- role-based access to inbox data

## Phase-2 (high value)

- reply/quote message context
- message reactions
- quick replies / canned responses
- assignment and handoff between agents
- better media previews (thumbnail generation)

## Later (optional)

- voice notes, stickers, location, contacts, polls
- typing indicators and presence
- archived chats, pinned chats, mute
- multi-channel inbox (WhatsApp + others)

---

## 4) Proposed Architecture

## 4.1 Data Model

Add new tables/migrations:

1. `inbox_conversations`
   - `id` (uuid, pk)
   - `channel` (`whatsapp` now, extensible later)
   - `phone_normalized`
   - `lead_id` (nullable fk)
   - `customer_id` (nullable fk)
   - `assigned_to` (nullable fk users)
   - `last_message_at`
   - `last_message_preview`
   - `unread_count` (int, default 0)
   - `created_at`, `updated_at`

2. `inbox_messages` (or evolve existing `whatsapp_messages`)
   - `id` (uuid, pk)
   - `conversation_id` (fk)
   - `direction` (`in` / `out`)
   - `type` (`text`, `image`, `video`, `document`, `audio`, `sticker`, `location`, `contact`)
   - `text_body` (nullable)
   - `meta_message_id` (unique nullable)
   - `status` (`queued`, `sent`, `delivered`, `read`, `failed`)
   - `reply_to_message_id` (nullable self fk)
   - `created_at`

3. `inbox_attachments`
   - `id` (uuid, pk)
   - `message_id` (fk)
   - `storage_provider` (`supabase`)
   - `bucket`
   - `object_path`
   - `public_url` / signed-url strategy
   - `mime_type`, `file_name`, `file_size_bytes`
   - `width`, `height`, `duration_ms` (nullable)
   - `thumbnail_path` (nullable)
   - `sha256` (nullable)
   - `created_at`

4. `inbox_participants` (optional MVP, recommended for future)
   - support internal watchers/agents on conversation

Prefer migration strategy:
- keep `whatsapp_messages` for backward compatibility initially
- create `inbox_*` tables
- run one-time backfill from `whatsapp_messages` into `inbox_messages`

## 4.2 API Layer

Create inbox-focused routes in `app/api/inbox/*`:

- `GET /api/inbox/conversations`
  - filters: assignee, unread, search, cursor
- `GET /api/inbox/conversations/[id]/messages`
  - cursor pagination (newest-first or oldest-first with stable cursor)
- `POST /api/inbox/messages`
  - send text/media/doc; returns optimistic payload + server canonical row
- `POST /api/inbox/messages/[id]/read`
  - mark message/conversation read
- `POST /api/inbox/attachments/signed-url`
  - direct upload path to Supabase (large files)

Keep existing WhatsApp routes as integration adapters:
- `app/api/marketing/whatsapp/send/route.ts`
- `app/api/webhooks/whatsapp/route.ts`

But route all persistence through a new `inbox.service.ts`.

## 4.3 Service Layer

Add `backend/services/inbox.service.ts` with:

- `upsertConversationByPhone(...)`
- `appendIncomingMessage(...)`
- `appendOutgoingMessage(...)`
- `attachMediaToMessage(...)`
- `listConversations(...)`
- `listMessages(...)`
- `markConversationRead(...)`
- `updateMessageStatusByMetaId(...)`

Refactor webhook and send handlers to call inbox service as source of truth.

## 4.4 Realtime

Continue Supabase Realtime with channels keyed by conversation:

- `inbox-conversation-{id}` for message inserts/status updates
- optional `inbox-user-{id}` for unread count updates

---

## 5) Product UX Roadmap

## 5.1 Inbox Page

Create new page (or evolve existing chat page):
- `app/inbox/page.tsx` (or `app/marketing/chat/page.tsx` refactor)

Layout:
- left pane: conversation list + search + unread badges + last message preview/time
- right pane: message thread + composer + attachment picker + status ticks
- mobile behavior: pane switching and sticky composer

## 5.2 Composer

- text input with enter-to-send
- attach button (image/video/document)
- upload progress and retry/cancel
- attachment size/type validation before upload
- reply-to context support (phase-2)

## 5.3 Message Rendering

- text bubble
- image preview lightbox
- video player with poster
- document tile with file icon + open/download
- outgoing status icon transitions (sent -> delivered -> read)

---

## 6) Security, Compliance, and Access Control

- enforce `requireAuth` on all inbox endpoints
- add/extend permission keys:
  - `inbox.read`
  - `inbox.send`
  - `inbox.attach`
  - `inbox.assign`
- enforce data access at query level (assignee/team/role visibility rules)
- use signed URLs for private files where possible
- sanitize file names and validate mime + magic-byte checks
- audit log for send/delete/assign actions

---

## 7) Performance and Reliability

- add indexes:
  - `inbox_messages(conversation_id, created_at desc)`
  - `inbox_messages(meta_message_id)`
  - `inbox_conversations(last_message_at desc, unread_count desc)`
- use cursor pagination; avoid offset for large histories
- deduplicate incoming webhooks by `meta_message_id`
- idempotency key for outbound send retries
- fallback job to reconcile message statuses if webhook misses events

---

## 8) Testing Strategy

Because the current repo has no formal test harness, adopt this sequence:

1. Add minimal API integration tests for inbox routes (happy + auth + validation paths)
2. Add webhook contract tests with captured payload fixtures
3. Add UI interaction tests for:
   - send text
   - send image/video/document
   - realtime update rendering
4. Add migration/backfill verification script for data consistency

---

## 9) Delivery Plan (8 Weeks)

## Week 1-2: Foundation

- design DB schema + migrations for `inbox_*`
- implement `inbox.service.ts`
- create conversation list/message list APIs
- add indexes and baseline observability logs

## Week 3-4: Core Messaging

- implement send text through inbox domain
- wire inbound webhook to inbox persistence
- add read/unread mechanics
- support realtime updates in UI

## Week 5-6: Attachments

- signed URL upload endpoint + validation
- media/document send flow
- attachment rendering in thread
- error/retry flows for failed uploads/sends

## Week 7: Hardening

- permissions enforcement refinement
- status reconciliation job
- pagination and query tuning
- bug fixes from internal UAT

## Week 8: Rollout

- feature flag rollout by role/team
- migration/backfill verification in production
- monitoring dashboards and on-call runbook

---

## 10) Rollout and Backward Compatibility

- keep existing endpoints operational during transition
- dual-write (temporary) to old and new message stores where needed
- complete backfill + parity checks
- switch UI to new inbox APIs
- retire legacy chat pathways after validation window

---

## 11) Concrete File-Level Implementation Map

Likely new files:

- `database/migrations/0xx_inbox_conversations.sql`
- `database/migrations/0xx_inbox_messages.sql`
- `database/migrations/0xx_inbox_attachments.sql`
- `backend/services/inbox.service.ts`
- `app/api/inbox/conversations/route.ts`
- `app/api/inbox/conversations/[id]/messages/route.ts`
- `app/api/inbox/messages/route.ts`
- `app/api/inbox/messages/[id]/read/route.ts`
- `app/api/inbox/attachments/signed-url/route.ts`
- `app/inbox/page.tsx` (or refactor existing `app/marketing/chat/page.tsx`)

Files to refactor:

- `app/api/webhooks/whatsapp/route.ts`
- `app/api/marketing/whatsapp/send/route.ts`
- `backend/services/whatsapp-chat.service.ts` (bridge layer or deprecation path)
- `shared/types/database.ts` (generated/updated types after migrations)

---

## 12) Risks and Mitigations

- **Risk:** webhook out-of-order delivery  
  **Mitigation:** monotonic status update logic + reconciliation job.

- **Risk:** file abuse (type spoofing / oversized uploads)  
  **Mitigation:** strict server-side validation + size limits + signed uploads.

- **Risk:** query slowdown at scale  
  **Mitigation:** cursor pagination + proper indexes + load testing with seed data.

- **Risk:** data fragmentation between old/new tables  
  **Mitigation:** dual-write window + deterministic backfill + parity dashboards.

---

## 13) Definition of Done (MVP)

- users can open inbox and see conversations with unread counts
- users can send/receive text in realtime
- users can upload and send image/video/document and render them in thread
- message states update to sent/delivered/read/failed
- permissions are enforced and audited
- migration + rollback steps documented and validated

