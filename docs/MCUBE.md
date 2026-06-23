# MCUBE integration

Configure these environment variables on the server (e.g. Vercel project settings or `.env.local`):

| Variable | Purpose |
|----------|---------|
| `MCUBE_API_TOKEN` | Bearer token for [outbound API](https://api.mcube.com/Restmcube-api/outbound-calls). Sent as `HTTP_AUTHORIZATION` in the JSON body (per MCUBE’s format). |
| `MCUBE_WEBHOOK_SECRET` | Shared secret for **incoming** webhooks. The app accepts it as `Authorization: Bearer <secret>`, header `x-mcube-webhook-secret: <secret>`, or query `?secret=<secret>`. |
| `MCUBE_REFURL` | Optional. Passed as `refurl` on outbound calls. If unset, app falls back to `<NEXT_PUBLIC_APP_URL>/api/webhooks/mcube?secret=<MCUBE_WEBHOOK_SECRET>` when possible, otherwise `1`. |
| ~~`MCUBE_EXECUTIVE_NUMBER`~~ | **Do not use.** Outbound always uses the logged-in user’s **Teams → Phone (MCUBE executive)**. A shared env number made every caller dial from the same line. |

## Webhook URL

Register this URL in the MCUBE dashboard for **On Call** / **On Hangup** (or equivalent) event delivery:

`https://<your-production-domain>/api/webhooks/mcube`

The handler expects JSON with at least `callid`. Hangup is detected when `endtime` is present, or when the payload includes an `event` value that contains `hangup` (case-insensitive). Optional `event` values such as `on_call` / `on hangup` override inference.

## Per-caller executive numbers (multiple tele-callers)

1. In **Teams**, set each tele-caller’s **Phone (MCUBE executive)** to the same number registered for that agent in the MCUBE portal (outbound API enabled for that executive).
2. When caller A is logged in and clicks **Call via MCUBE**, CRM sends A’s number as `exenumber`. Caller B sends B’s number.
3. Remove **`MCUBE_EXECUTIVE_NUMBER`** from server env (Vercel / `.env.local`) if present, then redeploy.

Webhooks match `emp_phone` to `users.phone` (digit normalization) to set `called_by`. If no match, the outbound session’s **`initiated_by`** user is used, then the lead’s **`assigned_to`**.

## Outbound dial number format

The MCUBE outbound API expects **domestic numbers without country code** (e.g. **10 digits** for India). The CRM sends the **last 10 digits** of the agent and lead numbers to MCUBE. If calls still do not connect, confirm in the MCUBE portal that your token, executive extension, and DID routing match those numbers.

## Database

Apply migration `034_mcube_integration.sql` so `calls` and `mcube_outbound_sessions` exist before using the feature.

For **failed-call WhatsApp automation**, also apply `052_mcube_failed_call_whatsapp.sql`. Configure under **Settings → MCUBE Call Rules → Failed-call WhatsApp template** (admin only).

## Failed-call WhatsApp (admin)

When enabled, after an **outbound** MCUBE hangup where the lead was **not answered / not connected / not reachable** (`not_reachable` outcome — e.g. `NOANSWER`, `BUSY`, `CANCEL`), the CRM sends the selected **approved WhatsApp template** to the lead automatically.

- Requires WhatsApp Business configured (Settings → Integrations).
- One template per MCUBE account settings row; idempotent per `mcube_call_id` (no double-send on webhook retry).
- Audit log: `mcube_failed_call_whatsapp_log`.

## Troubleshooting outbound (502 / MCUBE error text)

If the API responds with something like:

**`Invalid Request or Executive is not opted for Outbound Calls or agent is in oncall`**

this comes from **MCUBE**, not from the CRM. Typical meanings:

1. **Executive not opted for outbound** — In the MCUBE admin portal, the executive / extension used as `exenumber` must be **enabled for outbound / click-to-call API** (wording varies by MCUBE version). Ask your MCUBE account admin to turn outbound API on for that agent.
2. **Agent is on call** — The same executive cannot start another outbound session while **already on a call**. Finish or release the line, then try again.
3. **Invalid request** — Token wrong for the account, `exenumber` not registered to that account, or number format not accepted. Confirm `MCUBE_API_TOKEN` and that the caller’s **Teams → Phone (MCUBE executive)** matches the executive MCUBE expects (last 10 digits are sent).

If calls are placed but **recording / call duration / dial status are not appearing in CRM**, the webhook callback is usually not reaching this route:

- `POST /api/webhooks/mcube`

Check that MCUBE is posting to a **public HTTPS URL** (not localhost). For local testing, use a public tunnel URL and set `MCUBE_REFURL` accordingly.

After fixing MCUBE-side settings, retry **Call via MCUBE** from the CRM.
