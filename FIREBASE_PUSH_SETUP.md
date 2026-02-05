# Firebase Cloud Messaging (FCM) Push Notifications

Push notifications for the PWA and web app are implemented with **Firebase Cloud Messaging**. When configured, users receive push notifications (e.g. when a follow-up is assigned to them), including when the app is in the background or closed.

## What’s implemented

- **Token storage**: FCM tokens are stored in `user_push_tokens` (one row per device per user).
- **Registration**: When a user is logged in, the client requests notification permission, gets an FCM token, and sends it to `POST /api/push/register`.
- **Sending**: When a follow-up is created, the assigned user gets a push (title/body and optional click-through to the lead).
- **Foreground**: While the app is open, messages are handled by the client and shown as browser `Notification` if permission is granted.
- **Background**: When the app is closed or in the background, the FCM service worker (`/api/push/sw`) shows the notification and handles click (opens the app to the lead page).

## Prerequisites

1. A [Firebase project](https://console.firebase.google.com/).
2. **Cloud Messaging** enabled (same project as your app).
3. **Web Push certificates**: In Firebase Console → Project Settings → Cloud Messaging → **Web configuration** → **Web Push certificates**, generate or import a key pair. You will need the **public key** (VAPID key) for the client.

## Environment variables

You need **two separate** sets of credentials:

1. **Service account JSON** → backend only (sending push).
2. **Web app config + VAPID key** → browser + service worker (requesting permission, getting token, receiving push).

### Client (browser) – required for push to work in the app

Set these in `.env.local` (or your deployment env). They are **public** and used by the client and the FCM service worker to initialize Firebase and get FCM tokens.

**Where to get them:** Firebase Console → your project → **Project settings** (gear) → **General** → under **Your apps** select your **Web** app (or add one). Copy the config object; the VAPID key is under **Cloud Messaging** tab → **Web configuration** → **Web Push certificates** (generate or copy the **public** key).

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Web API key from your web app config. |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | e.g. `YOUR_PROJECT_ID.firebaseapp.com`. |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | e.g. `xcel-crm`. |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | e.g. `YOUR_PROJECT_ID.appspot.com`. |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Numeric Sender ID from web app config. |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Web app ID (e.g. `1:...:web:...`). |
| `NEXT_PUBLIC_FIREBASE_VAPID_KEY` | **Public** Web Push (VAPID) key from Cloud Messaging → Web Push certificates. |

### Server (sending messages)

| Variable | Description |
|----------|-------------|
| `FIREBASE_SERVICE_ACCOUNT` | **Secret.** Full JSON of the Firebase **service account** key (the file you download from Project settings → Service accounts → Generate new private key). Used only by the backend to send FCM messages. |
| `NEXT_PUBLIC_APP_URL` | **(Recommended for production.)** Full app URL (e.g. `https://your-domain.com`). Used to build click-through links in push notifications so they open the correct origin when the app is in background or killed. If unset, Vercel deployments use `https://VERCEL_URL` automatically. |

- Paste the **entire** JSON as the value (minified one line is fine). Do **not** commit this; use env vars or a secrets manager only.
- The service account is **different** from the web app config above: the former is for server-side sending, the latter is for the browser to get and receive push.

## Database

Run the migration that creates the push tokens table:

- `database/migrations/015_user_push_tokens.sql`

It creates `public.user_push_tokens` and the trigger for `updated_at`. If you use Supabase migrations, run this migration in your usual way (e.g. Supabase CLI or SQL Editor).

## Optional: disable push

- **Client**: If any of the `NEXT_PUBLIC_FIREBASE_*` or VAPID key are missing, the app will not register for push or initialize FCM.
- **Server**: If `FIREBASE_SERVICE_ACCOUNT` is not set, the backend will not send any FCM messages (create follow-up will still succeed).

## Testing

1. Set all client and server env vars and run migrations.
2. Build and run the app (e.g. `npm run build && npm start`). Use **HTTPS** (or `localhost`) so the Push API and service worker work.
3. Log in as a user who can be assigned follow-ups (e.g. tele_caller).
4. Allow notifications when the browser prompts.
5. From another user/session, create a follow-up and assign it to that user. They should get a push; clicking it should open the lead page.

## How to verify push is working

1. **Check backend can send**  
   Ensure `FIREBASE_SERVICE_ACCOUNT` is set in `.env.local` (full service account JSON). Without it, no push is sent when follow-ups are created.

2. **Check token is registered**  
   - In the browser console (F12) after login, look for: `[Push] FCM token registered successfully.`  
   - Or call **GET /api/push/status** while logged in (e.g. open `http://localhost:3001/api/push/status` in the same browser session). Response: `{ "configured": true, "tokensCount": 1, "message": "..." }`. If `tokensCount` is 0, allow notifications and refresh.

3. **Check database**  
   In Supabase SQL Editor: `SELECT * FROM public.user_push_tokens;`  
   You should see one row per device where the user allowed notifications and loaded the app while logged in.

4. **End-to-end test**  
   - Log in as **User A** (e.g. tele_caller) on the device where you want push. Allow notifications; confirm `[Push] FCM token registered` in console or `tokensCount >= 1` from `/api/push/status`.  
   - From another browser/device, log in as **User B**, create a follow-up and assign it to **User A**.  
   - **User A**’s device should show a notification (app in foreground or background). Clicking it should open the lead.

## Why push might not be sent or received

| Cause | What to do |
|-------|------------|
| **FIREBASE_SERVICE_ACCOUNT not set** | Backend never sends. Add the full service account JSON to `.env.local` and restart the server. |
| **No FCM token stored** | User didn’t allow notifications, or registration failed. Check console for `[Push]` logs; ensure no cross-origin block (see below). Allow notifications and refresh. |
| **Cross-origin blocked (mobile / network URL)** | When opening the app from another device (e.g. `http://192.168.1.36:3000`), Next.js may block `/_next/*` or API requests. Add the **hostname** (not the full URL) to `allowedDevOrigins` in `next.config.ts`, e.g. `'192.168.1.36'`. Then restart the dev server. |
| **HTTP on mobile** | Push and service workers can be restricted over plain HTTP on non-localhost origins. For reliable push on phones, use HTTPS (e.g. deploy or use a tunnel like ngrok). |
| **Wrong port** | Dev server may run on 3001 if 3000 is in use. Use the URL shown in the terminal (e.g. `http://192.168.1.36:3001`). |

## API

- **POST /api/push/register**  
  Body: `{ "fcm_token": "<token>", "device_label": optional string }`  
  Registers the current user’s FCM token (requires auth). Called automatically on sign-in when the user allows notifications.

- **DELETE /api/push/register**  
  Body: `{ "fcm_token": "<token>" }`  
  Removes the token (e.g. on logout). Requires auth.

- **GET /api/push/status**  
  Returns `{ configured, tokensCount, message }` for the current user. Use to confirm the backend can send and the user has at least one token. Requires auth.

- **GET /api/push/sw**  
  Returns the FCM service worker script with Firebase config injected (for background push). No auth.
