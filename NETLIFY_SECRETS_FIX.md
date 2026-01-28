# Netlify Secrets Scanning Fix

## Issue
Netlify's secret scanner detected Supabase keys during build and aborted the deployment.

## Root Cause
- Secret scanner flags environment variable names in code (even if values aren't committed)
- Error messages referenced env var names that could appear in build logs
- Service client wasn't explicitly marked as server-only

## Fixes Applied

### 1. Ensured Service Client is Server-Only
- Added documentation comment to `lib/supabase/service.ts` clarifying server-only usage
- Function is only imported in API routes and backend services (automatically server-only in Next.js App Router)
- Ensures `SUPABASE_SERVICE_ROLE_KEY` is never bundled into client code

### 2. Updated Error Messages
- Changed error message from `'SUPABASE_SERVICE_ROLE_KEY is not set'` to `'Service role key is not configured'`
- Removes env var name from potential build logs

### 3. Updated Documentation
- Removed actual secret values from README.md
- Replaced with placeholder values

### 4. Created Netlify Configuration
- Added `netlify.toml` with proper build settings
- Includes notes about secret management

## Verification Checklist

✅ `.env.local` is in `.gitignore` (not committed)
✅ No actual secret values in repository
✅ Service client is server-only (only used in API routes/backend services)
✅ No console.log statements print env vars in app/lib/backend
✅ Error messages don't expose env var names
✅ README uses placeholder values

## Next Steps for Netlify Deployment

1. **Set Environment Variables in Netlify UI:**
   - Go to Site settings → Build & deploy → Environment
   - Add these variables (do NOT commit them):
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `SUPABASE_SERVICE_ROLE_KEY`

2. **Verify Build:**
   - The build should now pass Netlify's secret scanner
   - If it still fails, check Netlify build logs for any remaining secret exposure

3. **Security Best Practices:**
   - Never commit `.env` files
   - Never log env vars in production code
   - Use `NEXT_PUBLIC_` prefix only for safe-to-expose values
   - Service role keys should NEVER have `NEXT_PUBLIC_` prefix
   - Service role keys should ONLY be used in server-side code (API routes, server components)

## Important Notes

- Scripts in `/scripts` folder mention env var names in error messages, but these don't run during build
- The service client (`createServiceClient`) is only used in API routes and backend services (server-side)
- Client components use `createClient` from `lib/supabase/client.ts` which uses the anon key (safe for client)
