## Executive Summary v2

This pass looks at **each major page and cross-cutting feature** (auth, navigation, notifications, large tables, and integrations) and identifies where we can further improve **load time, responsiveness, and perceived speed**, building on `speed.md`. The current app is structurally sound but heavily **client-driven**: most pages are `use client` React components that do their own auth checks and `fetch` calls, leading to **duplicate work, slower data arrival, and more JS on the client** than necessary. The biggest remaining opportunities are to:

- Move more read-only data fetching to the **server layer** (or server actions) so pages render with data on first paint.
- **Centralise and cache** repeated queries (leads, followups, analytics, counts) instead of each page calling `/api/*` and Supabase separately.
- Reduce the cost of **large lists and N+1 patterns** (Teams, Leads, Followups, Customers) via summarised APIs, virtualisation, and memoisation.
- Tighten **polling and interval usage** so we don’t keep hitting APIs when the data isn’t changing frequently or the tab isn’t visible.

None of the recommendations here require changing business rules, statuses, or API contracts; they are structural and behavioural optimisations around data loading, rendering, and sequencing.

---

## Page-by-Page Performance Review

### Dashboard (`app/dashboard/page.tsx`)

- **Current behaviour**
  - Client component that:
    - Calls `supabase.auth.getUser()` and then an extra `users` query to obtain role.
    - Fetches analytics from `/api/analytics`.
    - For tele_callers, also fetches `/api/followups/notifications` + runs an interval.
  - Shows a better skeleton now, but data still arrives via client calls after mount.

- **Issues**
  - **Redundant auth work**: role information could be consumed from the shared `AuthProvider` instead of hitting Supabase again.
  - **Client-only analytics**: user waits for `/api/analytics` after hydration, which is why the logs show 2–3s `render` times on that route.
  - **Additional followups fetch** overlaps with the shared followups provider we introduced.

- **Improvements**
  - Use `useAuthContext()` for `userRole` instead of running a Supabase query in `checkAuth`.
  - Move the analytics computation into a **server component or server action** (`GET /dashboard` should render with analytics already computed where possible).
  - Remove per-page `/api/followups/notifications` fetch and rely fully on the **shared `FollowupNotificationsProvider`** for followup counts on the Dashboard.

---

### Leads list (`app/leads/page.tsx`)

- **Current behaviour**
  - Large `use client` page with:
    - A lot of UI logic (grid vs list view, filters, badges).
    - Data fetching (not fully shown here but via `/api/leads` and Supabase).
    - Eager calculation of derived values for each lead.
    - Heavy UI components (icons, images, cards) for every lead row.
    - We’ve already lazy-loaded `NewLeadForm`.

- **Issues**
  - Potentially **large DOM** and render cost when many leads are present (grid view renders every card).
  - Derived lookups inside the render (`getVehicleName`, `getBudget`, `getLocation`, `getLastContactedTime`) run per-lead per render.
  - If filters / state change, **all leads re-render**.

- **Improvements**
  - Introduce **row/card-level memoisation**:
    - Extract the card into `LeadCard` and wrap with `React.memo`, making sure props are stable.
  - Use **list virtualisation** with a library like `@tanstack/react-virtual` to only render visible rows/cards.
  - Move heavy derived properties (e.g. `vehicleName`, `budget`, `company`, `location`) into **precomputed fields** on the server/API or compute them once in a `useMemo` per lead list, not inline in JSX.
  - Optionally move the initial leads fetch to a **server component**, hydrating the list client-side only for interactions (sorting/filtering).

---

### Lead detail (`app/leads/[id]/page.tsx`)

- **Current behaviour**
  - Client component that:
    - Runs `supabase.auth.getUser()` + role fetch via Supabase (for permission gating).
    - Fetches the lead via `/api/leads/:id`.
    - Fetches products separately from `/api/products`.
    - Handles status updates, call outcomes, and quotation creation via further API calls.

- **Issues**
  - **Sequential data loading**: auth, lead, and products are all awaited in separate functions, so first meaningful render waits on multiple promises.
  - Products are always fetched even if not needed immediately (e.g. user just wants to see basic lead info).

- **Improvements**
  - Use `useAuthContext()` for auth/role and **remove redundant client-side Supabase auth**.
  - Parallelise lead + products fetching where appropriate (e.g. call both APIs in `Promise.all`).
  - For read-only aspects of the page (lead summary, timeline), move those into a **server component** that fetches `lead` + `products` (if required) before rendering.
  - Consider **lazy-loading** quotation / call-outcome modals or side panels that are not always opened.

---

### Follow-ups list (`app/followups/page.tsx`)

- **Current behaviour**
  - Client component with:
    - `useEffect` that runs on every `filter` change: `checkAuth()`, `fetchFollowUps()`, `fetchTotalLeads()`.
    - `fetchTotalLeads()` calls `/api/leads` and takes the length.
    - `fetchFollowUps()` calls `/api/followups` with date filter query params.

- **Issues**
  - `checkAuth()` is run on **every filter change**, doing Supabase auth + DB read repeatedly.
  - `fetchTotalLeads()` is run on every filter change even though the number of total leads is **independent of the followup filter**.
  - If there are many leads, `/api/leads` just to count them can be expensive; a dedicated count API / SQL `COUNT(*)` would be cheaper.

- **Improvements**
  - Use `useAuthContext()` to replace `checkAuth()`, and **run auth once on mount**, not on every filter change.
  - Split effects:
    - One `useEffect` on mount to validate auth.
    - One `useEffect` on `[filter]` just to fetch followups.
    - A separate `useEffect` on mount for total leads (or move to a server prop).
  - Add a lightweight `/api/leads/count` endpoint that returns a scalar count, rather than fetching all leads and counting on the client.
  - Convert this page to use **React Query** for both followups and counts; use `staleTime` to avoid refetching when toggling filters quickly or revisiting the page.

---

### Customers list (`app/customers/page.tsx`)

- **Current behaviour**
  - Client page that:
    - Runs `checkAuth()` with `supabase.auth.getUser()` on mount.
    - Fetches customers from `/api/customers`.
    - Fetches `/api/leads` to compute `totalLeads`.

- **Issues**
  - Same pattern as Followups: **uses full `/api/leads` just to get a count**.
  - Per-page auth check duplicates work already done by `AuthProvider`.
  - Full-screen loading fallback hides layout while data is fetched.

- **Improvements**
  - Use `useAuthContext()` for auth status; only redirect to `/login` based on context (or rely on route guards).
  - Replace `/api/leads` call with a count-specific endpoint or include total leads in `/api/customers` response if cheap.
  - Keep existing skeleton/placeholder pattern (like on Dashboard/Admin) instead of full-screen “Loading…” that hides `Layout`.

---

### Teams (`app/teams/page.tsx`)

- **Current behaviour**
  - Client page that:
    - Checks auth and role via Supabase (only admin/super_admin allowed).
    - Fetches all users via `/api/users`.
    - For **each user**, calls `fetchUserStats`, which uses Supabase directly to:
      - `SELECT count(*) FROM leads WHERE assigned_to = userId`.
      - `SELECT count(*) FROM leads WHERE assigned_to = userId AND status IN ('converted', 'deal_won', 'fully_paid')`.

- **Issues**
  - This is an **N+1 query pattern**: for N users we do 2*N Supabase `select` calls, which can easily dominate request time.
  - Stats are all **derived from the same `leads` table** and could be calculated in a single aggregate query on the server.

- **Improvements**
  - Introduce a single backend endpoint `/api/users/performance` that returns:
    - `[{ user_id, assignedLeads, convertedLeads, rating, status }, ...]`
  - Let the backend (or Supabase SQL RPC) run one or a few **grouped aggregate queries**:
    - e.g. `SELECT assigned_to, COUNT(*) as assigned, SUM(CASE WHEN status IN (...) THEN 1 ELSE 0 END) as converted FROM leads GROUP BY assigned_to;`
  - Replace the per-user `fetchUserStats` with one call to this endpoint; join the performance data with the `/api/users` list on the client.
  - This alone can turn Teams page load from **N*round_trip** to **1–2 round trips**.

---

### Integrations (`app/integrations/page.tsx`)

- **Current behaviour**
  - Fully client-side, localStorage-backed Mailjet config; only calls `/api/integrations/mailjet/test-send` on explicit user interaction.

- **Issues**
  - Mainly fine; this page is not on the hot path and doesn’t auto-poll.

- **Improvements**
  - Keep as-is for now; if Mailjet usage grows, consider lazy-loading the integration card via `dynamic()` when the user scrolls or clicks into Integrations.

---

### Reports & Settings (`app/reports/page.tsx`, `app/settings/page.tsx`)

- **Current behaviour**
  - Simple client components with static text; no data fetching yet.

- **Issues**
  - Using `'use client'` even though there is no client-only behaviour yet; small but unnecessary JS.

- **Improvements**
  - Convert these to **server components** (remove `'use client'`) until they need interactivity.

---

### Other Pages (Orders, Products, Quotations, Customers/[id], Admin detail pages)

Across these pages, there are recurring patterns:

- Each page typically calls:
  - `supabase.auth.getUser()` + user DB fetch for role/permissions.
  - One or more `/api/*` endpoints for the main data.
  - Occasionally direct Supabase queries in addition to the API data.

- **Issues**
  - **Duplicate auth/role fetching** that can now be replaced with `useAuthContext()`.
  - Multiple sequential API calls that could be:
    - Parallelised, or
    - Combined into a single “page payload” endpoint per page type.

- **Improvements**
  - Gradually refactor:
    - Auth checks to use `AuthProvider` or server middleware.
    - Page data loads into **server components** that pre-fetch data.
    - Direct Supabase-in-page usage into central backend services/APIs that can be cached and optimised.

---

## Cross-Cutting Opportunities

### 1. Reduce `use client` usage

- Many pages (`reports`, `settings`, some static sections of `integrations`, etc.) don’t truly need client-only features.
- Converting them to **server components** reduces JS bundle size and hydration time, making route transitions smoother.

### 2. Consolidate auth & role logic

- Replace per-page `supabase.auth.getUser()` + role lookups with the already-introduced `AuthProvider`:
  - Pages should rely on `useAuthContext()` for `isAuthenticated`, `userId`, and `role.name/permissions`.
  - Guarded routes can redirect on the server (middleware) or in a tiny client wrapper, but **shouldn’t re-run the full auth pipeline**.

### 3. Introduce React Query for shared data

- Wrap the app in `QueryClientProvider` and use `useQuery` for:
  - Analytics, leads, customers, followups, notification data.
- Benefits:
  - Built-in caching and deduplication.
  - `staleTime` and `cacheTime` control to avoid hitting the network on every tab click.
  - Easier parallel and dependent fetching patterns.

### 4. Tighten polling & data lifetimes

- Use **Visibility API** in `FollowupNotificationsProvider`:
  - Pause polling and audio/notifications when the tab is not active.
- Apply **longer intervals** and/or conditional polling (e.g. only on routes where followups matter).

### 5. Server-side aggregation & counts

- Replace:
  - `GET /api/leads` just to do `.length`.
  - Per-user Supabase stats calls in Teams.
- With:
  - Dedicated `/api/*/count` endpoints.
  - Aggregate SQL functions that compute stats in the database in one go.

---

## Prioritised Next Steps

1. **Dashboard data to server**  
   - Move analytics fetch to server component / server action.  
   - Consume `useAuthContext()` for role; remove duplicate Supabase auth.  
   - Rely solely on shared followups provider.

2. **Fix N+1 in Teams**  
   - Implement `/api/users/performance` with aggregated stats.  
   - Replace per-user `fetchUserStats` with one API call.

3. **Simplify and cache Followups & Customers counts**  
   - Add `/api/leads/count`.  
   - Stop calling `/api/leads` just to get `.length`.  

4. **Start using React Query for read-only APIs**  
   - Introduce `QueryClientProvider`.  
   - Migrate Dashboard analytics, Followups, Customers, and Leads list to `useQuery`.

5. **Gradual conversion of simple pages to server components**  
   - `reports`, `settings`, static parts of other pages.

These changes, combined with the already-implemented lazy loading and shared providers, will significantly reduce both **time-to-first-meaningful-content** and **ongoing API load**, while keeping the CRM’s business behaviour identical.

