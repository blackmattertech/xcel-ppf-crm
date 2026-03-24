# MCUBE integration

Configure these environment variables on the server (e.g. Vercel project settings or `.env.local`):

| Variable | Purpose |
|----------|---------|
| `MCUBE_API_TOKEN` | Bearer token for [outbound API](https://api.mcube.com/Restmcube-api/outbound-calls). Sent as `HTTP_AUTHORIZATION` in the JSON body (per MCUBE’s format). |
| `MCUBE_WEBHOOK_SECRET` | Shared secret for **incoming** webhooks. The app accepts it as `Authorization: Bearer <secret>`, header `x-mcube-webhook-secret: <secret>`, or query `?secret=<secret>`. |
| `MCUBE_REFURL` | Optional. Passed as `refurl` on outbound calls. If unset, app falls back to `<NEXT_PUBLIC_APP_URL>/api/webhooks/mcube?secret=<MCUBE_WEBHOOK_SECRET>` when possible, otherwise `1`. |
| `MCUBE_EXECUTIVE_NUMBER` | Optional. Forces `exenumber` for outbound calls (useful when the logged-in user phone differs from the MCUBE-enabled executive). |

## Webhook URL

Register this URL in the MCUBE dashboard for **On Call** / **On Hangup** (or equivalent) event delivery:

`https://<your-production-domain>/api/webhooks/mcube`

The handler expects JSON with at least `callid`. Hangup is detected when `endtime` is present, or when the payload includes an `event` value that contains `hangup` (case-insensitive). Optional `event` values such as `on_call` / `on hangup` override inference.

## Agent phones

Each user who places outbound calls must have **`users.phone`** set to the same executive number MCUBE uses (`exenumber`). Webhooks match `emp_phone` to `users.phone` (with digit normalization) to set `called_by`. If no match is found, the lead’s **`assigned_to`** user is used for the call log and journey updates.

## Outbound dial number format

The MCUBE outbound API expects **domestic numbers without country code** (e.g. **10 digits** for India). The CRM sends the **last 10 digits** of the agent and lead numbers to MCUBE. If calls still do not connect, confirm in the MCUBE portal that your token, executive extension, and DID routing match those numbers.

## Database

Apply migration `034_mcube_integration.sql` so `calls` and `mcube_outbound_sessions` exist before using the feature.

## Troubleshooting outbound (502 / MCUBE error text)

If the API responds with something like:

**`Invalid Request or Executive is not opted for Outbound Calls or agent is in oncall`**

this comes from **MCUBE**, not from the CRM. Typical meanings:

1. **Executive not opted for outbound** — In the MCUBE admin portal, the executive / extension used as `exenumber` must be **enabled for outbound / click-to-call API** (wording varies by MCUBE version). Ask your MCUBE account admin to turn outbound API on for that agent.
2. **Agent is on call** — The same executive cannot start another outbound session while **already on a call**. Finish or release the line, then try again.
3. **Invalid request** — Token wrong for the account, `exenumber` not registered to that account, or number format not accepted. Confirm `MCUBE_API_TOKEN` and that **`users.phone`** in the CRM matches the executive number MCUBE expects (last 10 digits are sent to MCUBE).

If calls are placed but **recording / call duration / dial status are not appearing in CRM**, the webhook callback is usually not reaching this route:

- `POST /api/webhooks/mcube`

Check that MCUBE is posting to a **public HTTPS URL** (not localhost). For local testing, use a public tunnel URL and set `MCUBE_REFURL` accordingly.

After fixing MCUBE-side settings, retry **Call via MCUBE** from the CRM.
