# PRD: Meta Ads Overview & Meta Integration

**Product Requirements Document**  
**Scope:** Meta (Facebook) Ads overview, integration architecture, and all Meta-related features in Xcel PPF CRM  
**Last updated:** March 2025

---

## 1. Executive Summary

This PRD describes the **Meta Ads overview** feature and the **end-to-end Meta integration** in the CRM: how ads data is displayed, how the system connects to Meta (OAuth + webhook), and how leads, campaigns, and insights are integrated.

---

## 2. Meta Ads Overview (Feature)

### 2.1 Purpose

Provide a single view of **Meta (Facebook/Instagram) ad performance** and **lead analytics** inside the marketing section: spend, impressions, reach, clicks, leads, CPM/CTR/CPL, campaigns, platform breakdown, and lead breakdown by product/location/region.

### 2.2 User-Facing Locations

| Location | Route | Data source |
|----------|--------|-------------|
| **Marketing → Overview** | `/marketing/overview` | Direct `GET /api/marketing/meta-ads-overview?date_range=...` |
| **Marketing → Dashboard** | `/marketing/dashboard` | Aggregated `GET /api/marketing/overview?...` (includes `metaAdsOverview`) |

Both pages render the same **“Meta Ads Manager”** block. The dashboard uses the overview API for ETag caching and a single request for WhatsApp + Meta.

### 2.3 Date Range Options

- **7d** → `last_7d`
- **30d** → `last_30d` (default)
- **90d** → `last_90d`

User can switch via tabs; the selected value is sent as `date_range` to the API.

### 2.4 UI Components (Meta Ads Manager Block)

1. **Connection state**
   - If **not connected**: message to connect Facebook Business in **Settings → Integrations** (and optional error text).
   - If **connected**: full Meta Ads Manager section.

2. **KPI cards (8 metrics)**
   - Spend, Impressions, Reach, Clicks, Leads, CPM, CTR, CPL  
   - Values from `accountSummary`; formatting (e.g. ₹ for spend, % for CTR) applied in the UI.

3. **Performance over time**
   - Chart: `insightsOverTime` (date, impressions, reach, spend, clicks, leads).  
   - ComposedChart (Recharts) with area/line; short date labels (e.g. “Mar 5”).

4. **Campaigns table**
   - Columns: Name, Status, Impressions, Reach, Leads (CRM vs Forms), Clicks, Spend.  
   - `crmLeads` = leads from Meta Lead Gen API (synced/webhook); `formsFilled` = Meta campaign insights “lead” action.

5. **Platform breakdown**
   - Bar chart: `byPlatform` (facebook, instagram, messenger, audience_network, etc.) with impressions/reach/spend/clicks.  
   - Colors: `META_PLATFORM_COLORS` (e.g. facebook #1877F2, instagram #E4405F).

6. **Lead analytics**
   - **By region:** bar chart (region, impressions, reach) – top regions from Meta insights.
   - **By product:** bar chart from `leadAnalytics.byProduct` (from Meta lead form field “interested product”).
   - **By location:** bar chart from `leadAnalytics.byLocation` (city/state combined).
   - **Summary cards:** Total Meta leads, Campaign count, Product buckets count.

### 2.5 Data Flow (Meta Ads Overview)

```
User (Overview or Dashboard)
    → GET /api/marketing/meta-ads-overview?date_range=last_30d
        [or via GET /api/marketing/overview with internal fetch]
    → Backend: requireAuth → load facebook_business_settings (created_by = user)
    → If not connected / no ad_account_id / token expired
        → return { connected: false, error, campaigns: [], leadAnalytics, dateRange }
    → Meta Graph API v25.0 (multiple parallel/serial requests):
        1. Campaigns + insights (date_preset)
        2. Insights by region (breakdowns=region)
        3. Lead analytics: fetchAllLeadsFromMeta(userId) → filter by date + campaign → aggregate by product/city/state/region
        4. Account-level insights (summary + time_increment=1 for daily)
        5. Insights by platform (breakdowns=publisher_platform)
    → Merge campaign list with lead counts (crmLeads vs formsFilled)
    → return { connected: true, campaigns, leadAnalytics, accountSummary, insightsOverTime, byPlatform, dateRange }
    → UI renders Meta Ads Manager block
```

### 2.6 API Contract: `GET /api/marketing/meta-ads-overview`

| Query param | Type | Description |
|-------------|------|-------------|
| `date_range` | string | `last_7d` \| `last_30d` \| `last_90d` |
| `ad_account_id` | string | Optional override; default from `facebook_business_settings.ad_account_id` |

**Response (connected):**

- `connected: true`
- `campaigns`: array of `{ id, name, status, impressions, reach, leads, crmLeads, formsFilled, clicks, spend }`
- `leadAnalytics`: `{ totalLeads, byCampaign, byProduct, byLocation, byCity, byState, byRegion }`
- `accountSummary`: `{ spend, impressions, reach, clicks, leads, cpm, ctr, cpl }`
- `insightsOverTime`: array of daily `{ date, impressions, reach, spend, clicks, leads }`
- `byPlatform`: array of `{ platform, impressions, reach, spend, clicks }`
- `dateRange`: echo of selected range

**Response (not connected / error):**

- `connected: false`
- `error`: string (e.g. “Facebook Business account not connected”, “Facebook access token expired”, “No ad account ID”)
- `campaigns: []`, `leadAnalytics` (empty structure), `dateRange`

---

## 3. Meta Integration Architecture

The CRM uses **two complementary mechanisms** for Meta: **webhook (lead ingestion)** and **Facebook Business OAuth (ads + lead pull/sync)**.

### 3.1 Mechanism 1: Meta Webhook (Lead Ads)

**Purpose:** Receive leads from Facebook Lead Ads in real time (Facebook → CRM).

| Aspect | Detail |
|--------|--------|
| **Endpoint** | `POST /api/webhooks/meta` (ingestion), `GET /api/webhooks/meta` (verification) |
| **Auth** | No user OAuth. Verification via `hub.verify_token` query param matching `META_WEBHOOK_VERIFY_TOKEN`. |
| **Flow** | Meta sends POST with `entry[].changes[].value` (lead payload). Backend parses with `meta-webhook.service` → creates lead with `source: 'meta'`, stores campaign/ad/form ids and `meta_data`. |
| **Lead creation** | `createLead(..., source: 'meta', campaign_id, ad_id, form_id, meta_data, ...)`; round-robin assignment for `meta` source. |

**Key files:**

- `app/api/webhooks/meta/route.ts` – POST handler, GET verification
- `backend/services/meta-webhook.service.ts` – `parseMetaWebhook`, `parseMetaLeadValue`
- `shared/types/meta-lead.ts` – `MetaWebhookPayload`, `MetaLeadValue`, `MetaLeadField`
- `shared/utils/lead-meta.ts` – `buildRequirementFromMeta`, `getInterestedProductFromMeta`, `getCityFromMeta`, `getStateFromMeta`, etc.

**What it does:** Automatically create leads in CRM from Lead Ad submissions; no need for user to “connect” for this path.  
**What it does not do:** No ad performance, no campaign list, no insights (those require OAuth).

### 3.2 Mechanism 2: Facebook Business OAuth (Ads + Lead Sync)

**Purpose:** User authorizes the app; CRM stores tokens and calls Meta Marketing API for ads data and optional lead sync.

| Aspect | Detail |
|--------|--------|
| **Endpoints** | `GET /api/integrations/facebook/connect` (start), `GET /api/integrations/facebook/callback` (callback), `GET/PATCH/DELETE /api/integrations/facebook/config`, `GET /api/integrations/facebook/ad-accounts`, `GET /api/integrations/facebook/ads`, `POST /api/integrations/facebook/sync-leads` and/or `POST /api/integrations/facebook/leads/sync` |
| **Auth** | OAuth 2.0 with Facebook. Scopes include `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`, `pages_manage_ads`, `business_management`, `ads_read`, `ads_management`, `leads_retrieval`. |
| **Storage** | Table `facebook_business_settings`: `access_token`, `page_id`, `page_name`, `page_access_token`, `ad_account_id`, `ad_account_name`, `business_id`, `business_name`, `expires_at`, `created_by`, `is_active`. |

**Connect flow:**

1. User clicks Connect in Settings → **FacebookIntegration** calls `GET /api/integrations/facebook/connect`.
2. Backend returns `authUrl` (Facebook OAuth URL with redirect_uri = `/api/integrations/facebook/callback`).
3. Frontend opens popup; user logs in and authorizes.
4. Meta redirects to callback with `code` and `state`.
5. Callback exchanges code for access token (`FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`), fetches `me/accounts` (pages) and `me/adaccounts`, resolves business, stores/updates `facebook_business_settings` (page + ad account + tokens).

**Key files:**

- `app/api/integrations/facebook/connect/route.ts` – build auth URL
- `app/api/integrations/facebook/callback/route.ts` – token exchange, pages, ad accounts, upsert settings
- `app/api/integrations/facebook/config/route.ts` – GET status, PATCH ad account, DELETE disconnect
- `app/api/integrations/facebook/ad-accounts/route.ts` – list ad accounts for picker
- `app/api/integrations/facebook/ads/route.ts` – ad performance for date range
- `app/api/integrations/facebook/sync-leads/route.ts`, `app/api/integrations/facebook/leads/sync/route.ts` – sync leads from Meta Lead Gen API into CRM
- `components/FacebookIntegration.tsx` – Settings UI: connect (popup), disconnect, sync leads, ad account picker

**What it does:** Power Meta Ads overview, ad performance API, lead sync from Meta, and any feature that needs ad account or page token.  
**What it does not do:** Does not create leads by itself on form submit (webhook does that); both can be used together.

### 3.3 How Overview Uses Integration

- **Meta Ads overview** requires **Facebook Business OAuth** to be connected (valid `facebook_business_settings` row with `ad_account_id` and non-expired token).
- **Lead analytics** in the overview use:
  - **Campaign/account metrics** from Meta Graph (campaigns, insights).
  - **Lead counts and breakdowns** from `fetchAllLeadsFromMeta(userId)` in `meta-leads.service` (Lead Gen API: page → leadgen_forms → leads), then filtered by date and campaign and aggregated by product/city/state/region using `lead-meta` helpers.
- So: **OAuth** is required for the overview; **webhook** is optional but recommended so that leads from the same campaigns also appear in CRM and in “CRM leads” counts.

---

## 4. Meta-Related Backend Services & Data

### 4.1 Meta Graph API Usage (v25.0)

| Feature | Endpoint / usage |
|--------|------------------|
| Meta ads overview – campaigns | `GET /{ad_account_id}/campaigns?fields=...,insights{...}&date_preset=...` |
| Meta ads overview – account insights | `GET /{ad_account_id}/insights?fields=...&date_preset=...&summary=...` |
| Meta ads overview – daily series | `GET /{ad_account_id}/insights?fields=...&time_increment=1&date_preset=...` |
| Meta ads overview – by region | `GET /{ad_account_id}/insights?breakdowns=region&...` |
| Meta ads overview – by platform | `GET /{ad_account_id}/insights?breakdowns=publisher_platform&...` |
| Lead analytics (overview) | `meta-leads.service`: `/{page_id}/leadgen_forms`, `/{form_id}/leads` (paginated) |
| OAuth callback | Token exchange, `me/accounts`, `me/adaccounts`, business resolution |
| Facebook ads API | `GET /api/integrations/facebook/ads` → account insights + campaigns |
| Ad accounts list | `GET /api/integrations/facebook/ad-accounts` → `me/adaccounts` |

### 4.2 Database

- **facebook_business_settings** (migration `010_facebook_business_integration.sql`, extended in `016_facebook_page_access_token.sql`): stores per-user OAuth result (tokens, page, ad account, business).
- **Leads:** `source = 'meta'` for webhook-created and (if implemented) sync-created leads; `meta_data`, `campaign_id`, `ad_id`, `form_id`, etc. stored on lead.

### 4.3 Lead Assignment

- `assignment.service` / `lead.service`: `LEAD_SOURCES` includes `'meta'`; round-robin assignment for `lead_source = 'meta'`.

---

## 5. WhatsApp / Meta (Out of Scope for “Ads” but Part of Meta Ecosystem)

For completeness, the following are Meta-related but **not** part of the Meta **Ads** overview:

- **WhatsApp Cloud API** (Meta): templates from Meta, template submit/delete, media upload, messaging. Uses `FACEBOOK_APP_ID` or `META_APP_ID`, `WHATSAPP_*` env vars.
- **WhatsApp template webhooks:** e.g. template status/category updates from Meta; `meta_template_id` / `meta_status` on template records.

These are documented elsewhere; the **Meta Ads overview** PRD scope is ads + lead analytics only.

---

## 6. Environment & Configuration

| Variable | Purpose |
|----------|---------|
| `FACEBOOK_APP_ID` | Facebook app ID (OAuth connect/callback, WhatsApp template/media). |
| `FACEBOOK_APP_SECRET` | OAuth token exchange in callback. |
| `META_WEBHOOK_VERIFY_TOKEN` | Webhook GET verification (`hub.verify_token`). |
| `META_APP_ID` | Optional alternative to `FACEBOOK_APP_ID` for WhatsApp/templates. |

No client-side Meta config; server uses env and `facebook_business_settings` for per-user tokens and selected ad account/page.

---

## 7. File Reference (Meta Ads Overview & Meta Integration)

| Area | Files |
|------|--------|
| **Meta Ads Overview API** | `app/api/marketing/meta-ads-overview/route.ts` |
| **Marketing overview aggregator** | `app/api/marketing/overview/route.ts` (includes meta-ads-overview fetch) |
| **Overview UI** | `app/marketing/overview/page.tsx` |
| **Dashboard UI** | `app/marketing/dashboard/page.tsx` |
| **Facebook OAuth & config** | `app/api/integrations/facebook/connect/route.ts`, `callback/route.ts`, `config/route.ts`, `ad-accounts/route.ts`, `ads/route.ts`, `sync-leads/route.ts`, `leads/sync/route.ts` |
| **Settings UI** | `components/FacebookIntegration.tsx`, `app/settings/page.tsx` (renders it, handles `?success=facebook_connected`) |
| **Webhook** | `app/api/webhooks/meta/route.ts` |
| **Webhook parsing** | `backend/services/meta-webhook.service.ts` |
| **Meta leads (Lead Gen API)** | `backend/services/meta-leads.service.ts` |
| **Types** | `shared/types/meta-lead.ts` |
| **Lead-meta helpers** | `shared/utils/lead-meta.ts` |
| **DB** | `database/migrations/010_facebook_business_integration.sql`, `016_facebook_page_access_token.sql` |
| **Docs** | `META_ADS_INTEGRATION.md`, `FACEBOOK_INTEGRATION_SETUP.md` |

---

## 8. Summary

- **Meta Ads overview** is the “Meta Ads Manager” block on **Marketing → Overview** and **Marketing → Dashboard**, showing KPIs, performance over time, campaigns table, platform breakdown, and lead analytics (by product, location, region).
- **Data** comes from **GET /api/marketing/meta-ads-overview** (or via **GET /api/marketing/overview**), which uses **Facebook Business OAuth** (stored in `facebook_business_settings`) to call **Meta Graph API v25.0** for campaigns, insights, and lead analytics (via `meta-leads.service`).
- **Meta integration** has two parts: **(1) Webhook** for automatic lead creation from Lead Ads; **(2) OAuth** for ads data, overview, and optional lead sync. Both can run together for a full Meta Ads + leads experience in the CRM.
