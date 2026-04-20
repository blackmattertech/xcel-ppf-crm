# Edge Function: `sheets-meta-lead`

Ingests a **single** Google Sheet row (Meta Lead Ads export) into `public.leads`, with the same phone-based upsert and round-robin assignment behavior as the Next.js `createLead` / `assignLeadRoundRobin` flow.

## Supabase secrets

**Do not** add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, or any name starting with `SUPABASE_` in **Edge Function Secrets** — the dashboard blocks those names because Supabase **already injects** them into every Edge Function (same as the message: default `SUPABASE_*` secrets are still available).

You only need a **custom** secret for this function:

| Secret | Where to set | Purpose |
|--------|----------------|---------|
| `SHEETS_SYNC_SECRET` | Dashboard → Edge Function Secrets **or** `supabase secrets set` | Long random string; Apps Script sends `Authorization: Bearer <value>` |

Generate that secret, for example:

```bash
openssl rand -hex 32
```

## Deploy

JWT verification should **not** be required for this endpoint (Apps Script sends only the shared Bearer secret, not a user JWT):

```bash
supabase functions deploy sheets-meta-lead --no-verify-jwt
```

Or disable JWT verification for this function in the dashboard.

**URL:** `https://<PROJECT_REF>.supabase.co/functions/v1/sheets-meta-lead`

## Request

- **Method:** `POST`
- **Headers:** `Authorization: Bearer <SHEETS_SYNC_SECRET>`, `Content-Type: application/json`
- **Body:** One JSON object whose keys match your sheet headers (e.g. `id`, `created_time`, `full_name`, `phone_number`, `email`, `lead_status`, …).

## Historical rows vs only-new rows

- **Default (no script property, or `SHEETS_CRM_LAST_ROW_PROCESSED` unset / `0`):** the first successful run walks **every data row** under the header (row 2 through last row in the data range). That **backfills** existing Sheet leads into Supabase. The Edge Function **upserts by phone**, so re-running the same rows mostly **updates** the same `leads` row instead of creating duplicates.
- **Only sync new rows from now on:** before the first automated run, set script property **`SHEETS_CRM_LAST_ROW_PROCESSED`** to the **0-based row index in `getDataRange().getValues()`** of the **last row you want to skip** (usually the last row that already exists in the CRM). Example: header is index `0`; if you have 200 data rows, their indices are `1`…`200`. To skip all of them, set `200`. The next run starts at `201` and only sends new rows appended after that.
- **Automatic new leads:** follow **[Automatic sync for all new leads](#automatic-sync-for-all-new-leads)** below (time-driven trigger is required; Meta often appends rows without firing `onEdit`).

## Automatic sync for all new leads

Do this once after the Edge Function is deployed and `SHEETS_SYNC_SECRET` is set.

1. Open the spreadsheet → **Extensions → Apps Script**. Paste the script below (set `EDGE_FUNCTION_URL`). **Save**.
2. **Project Settings → Script properties:** `CRM_SYNC_SECRET` = same value as `SHEETS_SYNC_SECRET`.
3. Select **`syncNewRowsToCrmOnce`** → **Run**. Approve **Authorization** (OAuth) the first time. Check **Executions** for errors.
4. **Install the repeating trigger** (this is what makes new leads sync automatically):
   - Run **`installTimeTriggerEveryFiveMinutes()`** once, **or**
   - Left sidebar **Triggers** (alarm clock) → **Add trigger** → function `syncNewRowsToCrmOnce` → event source **Time-driven** → type **Minutes timer** → every **5** minutes (or 1–10 as you prefer).
5. Confirm **Triggers** lists a time-driven entry for `syncNewRowsToCrmOnce`. From then on, **any new row** below the stored cursor is POSTed to Supabase on the next run (within your interval).

The script property **`SHEETS_CRM_LAST_ROW_PROCESSED`** remembers the last row index synced so **only rows after that** are sent—new Meta leads appended at the bottom are picked up automatically.

**Optional (faster than the timer):** run **`installOnChangeTrigger()`** once so row inserts also run `syncNewRowsToCrmOnce`. Keep the **time-driven** trigger anyway—some integrations do not emit `onChange` reliably.

## Google Apps Script (bound to the Sheet)

1. **Project Settings → Script properties:** add `CRM_SYNC_SECRET` = same value as `SHEETS_SYNC_SECRET`.
2. Set `EDGE_FUNCTION_URL` in the script (constant below) to your function URL.
3. Run **`installTimeTriggerEveryFiveMinutes()`** (or add the trigger via the UI) so new leads sync **automatically**—see [Automatic sync](#automatic-sync-for-all-new-leads) above.

```javascript
const EDGE_FUNCTION_URL = 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/sheets-meta-lead';
/** Last processed row index in `getDataRange().getValues()` (0 = header only). Next run starts at last+1. */
const SCRIPT_PROP_LAST_ROW = 'SHEETS_CRM_LAST_ROW_PROCESSED';

function getSyncSecret() {
  const p = PropertiesService.getScriptProperties().getProperty('CRM_SYNC_SECRET');
  if (!p) throw new Error('Set Script property CRM_SYNC_SECRET to match SHEETS_SYNC_SECRET');
  return p;
}

function syncNewRowsToCrmOnce() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const range = sheet.getDataRange();
  const values = range.getValues();
  if (values.length < 2) return;

  const headers = values[0].map(function (h) { return String(h).trim(); });
  const props = PropertiesService.getScriptProperties();
  var last = parseInt(props.getProperty(SCRIPT_PROP_LAST_ROW) || '0', 10);
  if (isNaN(last) || last < 0) last = 0;

  const secret = getSyncSecret();
  var maxSynced = last;

  for (var r = last + 1; r < values.length; r++) {
    var rowObj = {};
    var empty = true;
    for (var c = 0; c < headers.length; c++) {
      var key = headers[c];
      if (!key) continue;
      var cell = values[r][c];
      if (cell !== '' && cell !== null && cell !== undefined) empty = false;
      rowObj[key] = cell;
    }
    if (empty) {
      maxSynced = r;
      continue;
    }

    var res = UrlFetchApp.fetch(EDGE_FUNCTION_URL, {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + secret },
      payload: JSON.stringify(rowObj),
    });

    var code = res.getResponseCode();
    if (code !== 200 && code !== 201) {
      Logger.log('Row ' + (r + 1) + ' failed: HTTP ' + code + ' ' + res.getContentText());
      break;
    }
    maxSynced = r;
  }

  props.setProperty(SCRIPT_PROP_LAST_ROW, String(maxSynced));
}

function installTimeTriggerEveryFiveMinutes() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncNewRowsToCrmOnce') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncNewRowsToCrmOnce').timeBased().everyMinutes(5).create();
}

/** Optional: faster sync when rows are inserted; keep the time-based trigger as backup. */
function onSpreadsheetChangeForCrm(e) {
  if (!e || !e.changeType) return;
  if (e.changeType === 'INSERT_ROW' || e.changeType === 'OTHER') {
    syncNewRowsToCrmOnce();
  }
}

function installOnChangeTrigger() {
  var ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onSpreadsheetChangeForCrm') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onSpreadsheetChangeForCrm').forSpreadsheet(ss).onChange().create();
}
```

## CRM list cache

Next.js `GET /api/leads` caches the list for a short TTL. Rows created via this function appear after that TTL unless the app uses Realtime or you refresh. The app uses a slightly shorter TTL for the leads list cache (see `CACHE_TTL.LEADS_LIST` in `lib/cache.ts`).
