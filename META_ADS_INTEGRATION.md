# Meta Ads Integration Overview

## Two Complementary Integrations

Your CRM has **two separate but complementary** Meta/Facebook integrations:

### 1. Meta Webhook (Existing) - Lead Reception
**Purpose**: Automatically receive leads from Facebook Lead Ads

- **Type**: Passive webhook (Facebook → CRM)
- **Endpoint**: `/api/webhooks/meta`
- **How it works**: 
  - Facebook sends leads to your webhook when someone submits a Lead Ad form
  - Leads are automatically created in your CRM
  - No authentication needed (uses webhook verification token)
- **Setup**: Configure webhook URL in Meta Lead Ads settings

**What it does:**
- ✅ Receives leads automatically
- ✅ Creates leads in CRM with source = "meta"
- ✅ Stores campaign, ad, and form information
- ✅ Auto-assigns leads via round-robin

**What it doesn't do:**
- ❌ View ad performance
- ❌ Manage campaigns
- ❌ Pull ad insights
- ❌ Access ad account data

---

### 2. Facebook Business OAuth (New) - Meta Ads Marketing
**Purpose**: Active API access for Meta Ads management and analytics

- **Type**: OAuth integration (CRM ↔ Facebook API)
- **Endpoints**: 
  - `/api/integrations/facebook/connect` - Initiate connection
  - `/api/integrations/facebook/callback` - Handle OAuth callback
  - `/api/integrations/facebook/config` - Get connection status
  - `/api/integrations/facebook/ads` - Fetch ad performance data
- **How it works**:
  - User authorizes your app via OAuth
  - Access token is stored securely
  - Your CRM can now make API calls to Meta Marketing API

**What it does:**
- ✅ View ad performance (impressions, clicks, spend, CTR, CPC)
- ✅ Track lead generation from ads
- ✅ Monitor campaigns, adsets, and ads
- ✅ Access ad account information
- ✅ Build marketing dashboards
- ✅ Analyze ROI and conversion metrics

**What it doesn't do:**
- ❌ Receive leads automatically (that's the webhook's job)
- ❌ Create leads (webhook handles that)

---

## How They Work Together

```
┌─────────────────────────────────────────────────────────┐
│                    Meta/Facebook                        │
│                                                         │
│  ┌──────────────┐         ┌──────────────────────┐   │
│  │  Lead Ads    │────────▶│  Webhook (Passive)   │   │
│  │  (Forms)     │         │  Receives Leads      │   │
│  └──────────────┘         └──────────────────────┘   │
│                                                         │
│  ┌──────────────┐         ┌──────────────────────┐   │
│  │  Ad Account  │◀────────│  OAuth (Active)      │   │
│  │  & Campaigns │         │  Pulls Ad Data       │   │
│  └──────────────┘         └──────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
                   ┌──────────────┐
                   │  Your CRM    │
                   │              │
                   │  • Leads     │
                   │  • Analytics│
                   │  • Reports   │
                   └──────────────┘
```

### Complete Workflow:

1. **Lead Generation** (Webhook):
   - User sees your Facebook Lead Ad
   - User fills out the form
   - Facebook sends lead data to `/api/webhooks/meta`
   - Lead is created in CRM automatically

2. **Ad Performance** (OAuth):
   - You connect your Facebook Business account in Settings
   - CRM fetches ad performance via `/api/integrations/facebook/ads`
   - You can see:
     - How many leads each ad generated
     - Cost per lead (CPL)
     - Click-through rates
     - Campaign ROI

3. **Complete Picture**:
   - Webhook tells you **who** submitted leads
   - OAuth tells you **which ads** generated those leads and **how much** they cost

---

## Use Cases

### Scenario 1: Lead Management
**Use the Webhook** - You just want leads to come in automatically
- ✅ Set up webhook URL in Meta Lead Ads
- ✅ Leads flow in automatically
- ❌ Don't need OAuth connection

### Scenario 2: Marketing Analytics
**Use OAuth** - You want to analyze ad performance
- ✅ Connect Facebook Business account
- ✅ View ad performance dashboard
- ✅ Track ROI and optimize campaigns
- ❌ Webhook not required (but recommended for complete picture)

### Scenario 3: Complete Integration (Recommended)
**Use Both** - Full lead management + marketing analytics
- ✅ Set up webhook for automatic lead reception
- ✅ Connect OAuth for ad performance tracking
- ✅ Get complete picture: leads + ad performance
- ✅ Calculate cost per lead, ROI, conversion rates

---

## API Endpoints Summary

### Webhook (Lead Reception)
- `POST /api/webhooks/meta` - Receives leads from Facebook
- `GET /api/webhooks/meta` - Webhook verification

### OAuth (Ad Management)
- `GET /api/integrations/facebook/connect` - Start OAuth flow
- `GET /api/integrations/facebook/callback` - OAuth callback
- `GET /api/integrations/facebook/config` - Get connection status
- `DELETE /api/integrations/facebook/config` - Disconnect
- `GET /api/integrations/facebook/ads` - Fetch ad performance data

---

## Setup Checklist

### For Lead Reception (Webhook):
- [ ] Configure webhook URL in Meta Lead Ads: `https://yourdomain.com/api/webhooks/meta`
- [ ] Set webhook verify token in `.env.local`: `META_WEBHOOK_VERIFY_TOKEN`
- [ ] Test webhook with sample lead

### For Meta Ads Marketing (OAuth):
- [ ] Create Facebook App at developers.facebook.com
- [ ] Add OAuth redirect URI: `https://yourdomain.com/api/integrations/facebook/callback`
- [ ] Request required permissions (ads_read, ads_management, business_management)
- [ ] Add `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` to `.env.local`
- [ ] Run database migration: `010_facebook_business_integration.sql`
- [ ] Connect account in Settings → Integrations

---

## Example: Fetching Ad Performance

Once connected, you can fetch ad performance data:

```typescript
// Fetch ad insights
const response = await fetch('/api/integrations/facebook/ads?date_range=last_30d')
const data = await response.json()

// Data includes:
// - impressions, clicks, spend
// - CTR, CPC, CPM
// - leads generated
// - active campaigns, adsets, ads
```

---

## Summary

**Yes, the Facebook Business OAuth integration is for Meta Ads marketing!**

- **Webhook** = Receives leads (passive)
- **OAuth** = Manages ads & analytics (active)
- **Together** = Complete Meta Ads integration

Both are part of the same Meta/Facebook ecosystem but serve different purposes. For complete Meta Ads marketing functionality, you should use both.
