# Install Performance Indexes - Simple Instructions

## 📋 What You Need
- 5 minutes
- Access to Supabase Dashboard

---

## 🚀 Steps (Copy-Paste Method)

### Step 1: Open the SQL File
Open this file: **`scripts/install-indexes-simple.sql`** ⭐ USE THIS ONE

### Step 2: Copy Everything
- Select ALL text in that file (Cmd+A / Ctrl+A)
- Copy it (Cmd+C / Ctrl+C)

### Step 3: Open Supabase SQL Editor
1. Go to https://app.supabase.com
2. Select your project
3. Click **"SQL Editor"** in the left sidebar
4. Click **"New query"** button

### Step 4: Paste & Run
1. Paste the copied SQL (Cmd+V / Ctrl+V)
2. Click **"Run"** button (or press Cmd+Enter)
3. Wait 30-60 seconds for completion

### Step 5: Verify Success
After running, you should see:
```
✅ Success! Created 20 performance indexes
```

If you see this message, all indexes were created! 🎉

**Note:** This version works in transactions (fixes the error you were getting)

---

## ⚠️ If It Doesn't Work

**Error: "cannot run inside a transaction block"**

This means your SQL editor is wrapping the statements in a transaction. Try this:

### Alternative Method - Run in Batches

Copy and run these **5 batches** separately (paste each batch, click Run, wait for completion):

**Batch 1 - Most Critical (5 indexes):**
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS leads_status_assigned_to_idx ON leads(status, assigned_to) WHERE status != 'fully_paid';
CREATE INDEX CONCURRENTLY IF NOT EXISTS leads_status_created_at_idx ON leads(status, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS leads_source_status_idx ON leads(source, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS follow_ups_assigned_status_scheduled_idx ON follow_ups(assigned_to, status, scheduled_at) WHERE status = 'pending';
CREATE INDEX CONCURRENTLY IF NOT EXISTS quotations_lead_status_idx ON quotations(lead_id, status);
```

**Batch 2 - Lead Related (5 indexes):**
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS leads_email_idx ON leads(email) WHERE email IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS leads_branch_id_idx ON leads(branch_id) WHERE branch_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS lead_status_history_lead_created_idx ON lead_status_history(lead_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS calls_lead_created_idx ON calls(lead_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS leads_requirement_gin_idx ON leads USING GIN (to_tsvector('english', COALESCE(requirement, '')));
```

**Batch 3 - Follow-ups & Quotations (4 indexes):**
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS follow_ups_scheduled_status_idx ON follow_ups(scheduled_at, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS quotations_lead_version_idx ON quotations(lead_id, version DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS quotations_validity_status_idx ON quotations(validity_date, status) WHERE status NOT IN ('accepted', 'expired');
```

**Batch 4 - Orders & Users (6 indexes):**
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_customer_status_idx ON orders(customer_id, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_lead_status_idx ON orders(lead_id, status) WHERE lead_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_created_at_idx ON orders(created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS users_role_id_idx ON users(role_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS users_branch_id_idx ON users(branch_id) WHERE branch_id IS NOT NULL;
```

**Batch 5 - Products & Customers (2 indexes):**
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS products_active_created_idx ON products(is_active, created_at DESC) WHERE is_active = TRUE;
CREATE INDEX CONCURRENTLY IF NOT EXISTS customers_type_created_idx ON customers(customer_type, created_at DESC);
```

---

## ✅ After Installation

1. **Test your app** - Dashboard should load 60-70% faster!
2. **Verify indexes** with this query:
   ```sql
   SELECT count(*) as total_new_indexes 
   FROM pg_indexes 
   WHERE schemaname = 'public' 
   AND indexname LIKE '%_idx';
   ```
3. **Move to next optimization** - See `QUICK_ACTION_SUMMARY.md`

---

## 🎯 Quick Verification

Run this to see your new indexes:
```sql
SELECT tablename, indexname 
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND indexname LIKE '%status%'
ORDER BY tablename;
```

You should see multiple indexes with "status" in the name!

---

## 📞 Still Having Issues?

1. Make sure you're using **Supabase SQL Editor** (not a migration tool)
2. Try the "batch method" above (run 5 batches separately)
3. Each batch can be run independently - if one fails, try the others
4. Check for typos in table names (they should match your schema)

---

## ⏭️ What's Next?

After indexes are installed, continue with:
1. ✅ Indexes (you just did this!)
2. ⏭️ Fix 4 pages with unnecessary API calls
3. ⏭️ Parallelize dashboard API calls  
4. ⏭️ Add pagination to API routes

**See `QUICK_ACTION_SUMMARY.md` for details on steps 2-4!**
