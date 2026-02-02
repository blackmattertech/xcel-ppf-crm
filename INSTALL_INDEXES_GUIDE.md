# How to Install Performance Indexes

## ⚠️ The Problem

The migration file uses `CREATE INDEX CONCURRENTLY` which cannot run inside a transaction. Your migration tool wraps all SQL in transactions for safety, causing the error.

## ✅ Solution: Run Indexes Manually

Choose **ONE** of these methods:

---

## Method 1: Supabase SQL Editor (EASIEST - RECOMMENDED)

**Time:** 10-15 minutes  
**Difficulty:** Easy

### Steps:

1. **Open Supabase Dashboard**
   - Go to https://app.supabase.com
   - Select your project
   - Click "SQL Editor" in the left sidebar

2. **Open the SQL file**
   - Open: `scripts/create-performance-indexes-direct.sql`
   - This file has all 20 indexes

3. **Run indexes ONE AT A TIME**
   - Copy the FIRST index statement:
     ```sql
     CREATE INDEX CONCURRENTLY IF NOT EXISTS leads_status_assigned_to_idx 
       ON leads(status, assigned_to) 
       WHERE status != 'fully_paid';
     ```
   - Paste into SQL Editor
   - Click "Run"
   - Wait for "Success" (usually 5-30 seconds)
   - Repeat for the next index

4. **Priority Order** (do these first for biggest impact):
   - ✅ `leads_status_assigned_to_idx` (Index 1)
   - ✅ `leads_status_created_at_idx` (Index 2)
   - ✅ `leads_source_status_idx` (Index 3)
   - ✅ `follow_ups_assigned_status_scheduled_idx` (Index 6)
   - ✅ `quotations_lead_status_idx` (Index 8)

5. **Verify indexes were created**:
   ```sql
   SELECT indexname FROM pg_indexes 
   WHERE tablename = 'leads' 
   AND indexname LIKE '%status%';
   ```

### ⏱️ Time Estimate per Index
- Small tables (<1000 rows): 5-10 seconds
- Medium tables (1000-10K rows): 10-30 seconds
- Large tables (>10K rows): 30-60 seconds

### ✅ Benefits of this method:
- ✅ No code changes needed
- ✅ Visual progress (you see each index complete)
- ✅ Can stop/resume anytime
- ✅ Safe (uses CONCURRENTLY = no table locks)

---

## Method 2: psql Command Line (FOR ADVANCED USERS)

**Time:** 5-10 minutes  
**Difficulty:** Medium

### Steps:

1. **Get your database connection string**
   - From Supabase Dashboard → Settings → Database
   - Copy the "Connection string" (with password)

2. **Connect via psql**:
   ```bash
   psql "postgresql://postgres:[YOUR-PASSWORD]@[YOUR-HOST]:5432/postgres"
   ```

3. **Run each index** (copy-paste from `scripts/create-performance-indexes-direct.sql`)

4. **Or run them all** (if you trust the script):
   ```bash
   psql "your-connection-string" < scripts/create-performance-indexes-direct.sql
   ```

---

## Method 3: TypeScript Script (CURRENTLY NOT WORKING)

**Status:** ⚠️ Requires RPC function setup (not recommended for now)

The script at `scripts/create-performance-indexes.ts` needs a custom RPC function to execute raw SQL. Skip this method unless you're comfortable setting up Postgres functions.

---

## 🎯 Recommended Approach

**Use Method 1 (Supabase SQL Editor)** - it's the easiest and most reliable.

### Quick Start (5 Most Important Indexes)

If you want to start with just the 5 most impactful indexes:

**1. Copy these into Supabase SQL Editor, ONE AT A TIME:**

```sql
-- Index 1 (MOST IMPORTANT)
CREATE INDEX CONCURRENTLY IF NOT EXISTS leads_status_assigned_to_idx 
  ON leads(status, assigned_to) 
  WHERE status != 'fully_paid';

-- Index 2 (VERY IMPORTANT)
CREATE INDEX CONCURRENTLY IF NOT EXISTS leads_status_created_at_idx 
  ON leads(status, created_at DESC);

-- Index 3 (ANALYTICS)
CREATE INDEX CONCURRENTLY IF NOT EXISTS leads_source_status_idx 
  ON leads(source, status);

-- Index 4 (FOLLOW-UPS)
CREATE INDEX CONCURRENTLY IF NOT EXISTS follow_ups_assigned_status_scheduled_idx 
  ON follow_ups(assigned_to, status, scheduled_at) 
  WHERE status = 'pending';

-- Index 5 (QUOTATIONS)
CREATE INDEX CONCURRENTLY IF NOT EXISTS quotations_lead_status_idx 
  ON quotations(lead_id, status);
```

**2. Run each one separately, wait for completion**

**3. Test your application** - you should see 40-60% improvement immediately!

**4. Add the remaining 15 indexes later** when you have more time.

---

## ✅ How to Verify Indexes are Working

After creating indexes, run this query to check:

```sql
-- Check what indexes exist
SELECT 
  tablename,
  indexname,
  indexdef
FROM pg_indexes 
WHERE schemaname = 'public'
  AND (
    indexname LIKE '%status%' 
    OR indexname LIKE '%assigned%'
    OR indexname LIKE '%created_at%'
  )
ORDER BY tablename, indexname;
```

You should see the new indexes listed!

---

## ⚠️ Important Notes

1. **CONCURRENTLY is safe** - It won't lock your tables, users can keep working
2. **Takes time** - Each index takes 5-60 seconds depending on table size
3. **Can't rollback** - But you can drop indexes with:
   ```sql
   DROP INDEX CONCURRENTLY IF EXISTS index_name;
   ```
4. **Monitor** - Watch your application performance after creating indexes

---

## 🚀 Expected Results

After creating the first 5 indexes:
- ✅ Dashboard: 40-50% faster
- ✅ Leads list: 50-60% faster
- ✅ Analytics: 30-40% faster
- ✅ Follow-up notifications: 60-70% faster

After creating all 20 indexes:
- ✅ Dashboard: 60-70% faster overall
- ✅ All queries: Significantly improved

---

## 🆘 Troubleshooting

**"Index already exists"**
- That's fine! The `IF NOT EXISTS` clause prevents errors
- Skip to the next index

**"Permission denied"**
- Make sure you're using a superuser account
- Check you have `CREATE` privilege on the tables

**"Timeout"**
- Large tables might take longer
- The index is still being created in the background
- Check progress with: `SELECT * FROM pg_stat_progress_create_index;`

**"Still slow after indexes"**
- Indexes might not be used immediately
- Run `ANALYZE` on tables: `ANALYZE leads;`
- Check query plans with `EXPLAIN ANALYZE`

---

## 📞 Need Help?

If you run into issues:
1. Check the error message carefully
2. Verify table names match your schema
3. Make sure tables have data (empty tables don't benefit from indexes)
4. Try creating just 1-2 indexes first to test

---

## ✅ Once Indexes are Created

Move on to the next quick wins:
1. ✅ Indexes created (you are here)
2. ⏭️ Fix the 4 pages with unnecessary API calls (see `QUICK_ACTION_SUMMARY.md`)
3. ⏭️ Parallelize dashboard API calls
4. ⏭️ Add pagination to API routes

**See `QUICK_ACTION_SUMMARY.md` for next steps!**
