-- ============================================================================
-- PERFORMANCE OPTIMIZATION INDEXES - DIRECT SQL VERSION
-- ============================================================================
-- 
-- This file contains the same indexes as migration 015, but formatted
-- for direct execution in your database client (e.g., Supabase SQL Editor).
-- 
-- ⚠️  IMPORTANT: Run each CREATE INDEX statement SEPARATELY, one at a time.
--     Do NOT run them all at once in a transaction.
-- 
-- Why: CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
-- 
-- How to use:
--   1. Open Supabase SQL Editor (or your database client)
--   2. Copy ONE index creation statement at a time
--   3. Run it
--   4. Wait for completion (usually 5-30 seconds per index)
--   5. Move to the next index
-- 
-- Note: These indexes use CONCURRENTLY, so they won't lock your tables.
--       Your application can continue running during index creation.
-- ============================================================================

-- ============================================================================
-- LEADS TABLE INDEXES (Most Important - Do These First)
-- ============================================================================

-- Index 1: Tele-caller queries (my leads by status)
CREATE INDEX CONCURRENTLY IF NOT EXISTS leads_status_assigned_to_idx 
  ON leads(status, assigned_to) 
  WHERE status != 'fully_paid';
-- Wait for completion, then run the next one...

-- Index 2: Sorted lead lists
CREATE INDEX CONCURRENTLY IF NOT EXISTS leads_status_created_at_idx 
  ON leads(status, created_at DESC);
-- Wait for completion, then run the next one...

-- Index 3: Source analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS leads_source_status_idx 
  ON leads(source, status);
-- Wait for completion, then run the next one...

-- Index 4: Email duplicate detection
CREATE INDEX CONCURRENTLY IF NOT EXISTS leads_email_idx 
  ON leads(email) 
  WHERE email IS NOT NULL;
-- Wait for completion, then run the next one...

-- Index 5: Branch filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS leads_branch_id_idx 
  ON leads(branch_id) 
  WHERE branch_id IS NOT NULL;
-- Wait for completion, then run the next one...

-- ============================================================================
-- FOLLOW-UPS TABLE INDEXES (High Priority)
-- ============================================================================

-- Index 6: Pending follow-ups per user
CREATE INDEX CONCURRENTLY IF NOT EXISTS follow_ups_assigned_status_scheduled_idx 
  ON follow_ups(assigned_to, status, scheduled_at) 
  WHERE status = 'pending';
-- Wait for completion, then run the next one...

-- Index 7: Date range queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS follow_ups_scheduled_status_idx 
  ON follow_ups(scheduled_at, status);
-- Wait for completion, then run the next one...

-- ============================================================================
-- QUOTATIONS TABLE INDEXES
-- ============================================================================

-- Index 8: Lead quotations
CREATE INDEX CONCURRENTLY IF NOT EXISTS quotations_lead_status_idx 
  ON quotations(lead_id, status);
-- Wait for completion, then run the next one...

-- Index 9: Latest quotation version
CREATE INDEX CONCURRENTLY IF NOT EXISTS quotations_lead_version_idx 
  ON quotations(lead_id, version DESC);
-- Wait for completion, then run the next one...

-- Index 10: Expiry checks
CREATE INDEX CONCURRENTLY IF NOT EXISTS quotations_validity_status_idx 
  ON quotations(validity_date, status) 
  WHERE status NOT IN ('accepted', 'expired');
-- Wait for completion, then run the next one...

-- ============================================================================
-- LEAD STATUS HISTORY TABLE INDEXES
-- ============================================================================

-- Index 11: Lead timeline
CREATE INDEX CONCURRENTLY IF NOT EXISTS lead_status_history_lead_created_idx 
  ON lead_status_history(lead_id, created_at DESC);
-- Wait for completion, then run the next one...

-- ============================================================================
-- CALLS TABLE INDEXES
-- ============================================================================

-- Index 12: Lead call history
CREATE INDEX CONCURRENTLY IF NOT EXISTS calls_lead_created_idx 
  ON calls(lead_id, created_at DESC);
-- Wait for completion, then run the next one...

-- ============================================================================
-- ORDERS TABLE INDEXES
-- ============================================================================

-- Index 13: Customer orders
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_customer_status_idx 
  ON orders(customer_id, status);
-- Wait for completion, then run the next one...

-- Index 14: Lead orders
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_lead_status_idx 
  ON orders(lead_id, status) 
  WHERE lead_id IS NOT NULL;
-- Wait for completion, then run the next one...

-- Index 15: Date-sorted orders
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_created_at_idx 
  ON orders(created_at DESC);
-- Wait for completion, then run the next one...

-- ============================================================================
-- USERS TABLE INDEXES
-- ============================================================================

-- Index 16: Role-based queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS users_role_id_idx 
  ON users(role_id);
-- Wait for completion, then run the next one...

-- Index 17: Branch filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS users_branch_id_idx 
  ON users(branch_id) 
  WHERE branch_id IS NOT NULL;
-- Wait for completion, then run the next one...

-- ============================================================================
-- PRODUCTS TABLE INDEXES
-- ============================================================================

-- Index 18: Active products
CREATE INDEX CONCURRENTLY IF NOT EXISTS products_active_created_idx 
  ON products(is_active, created_at DESC) 
  WHERE is_active = TRUE;
-- Wait for completion, then run the next one...

-- ============================================================================
-- CUSTOMERS TABLE INDEXES
-- ============================================================================

-- Index 19: Customer type filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS customers_type_created_idx 
  ON customers(customer_type, created_at DESC);
-- Wait for completion, then run the next one...

-- ============================================================================
-- FULL-TEXT SEARCH INDEXES (Optional but Recommended)
-- ============================================================================

-- Index 20: Lead requirement text search
CREATE INDEX CONCURRENTLY IF NOT EXISTS leads_requirement_gin_idx 
  ON leads USING GIN (to_tsvector('english', COALESCE(requirement, '')));
-- Wait for completion...

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================
-- After creating all indexes, run this to verify:

SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes 
WHERE schemaname = 'public'
  AND indexname LIKE '%_idx'
ORDER BY tablename, indexname;

-- ============================================================================
-- CHECK INDEX USAGE (Run after a few days)
-- ============================================================================

SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan as scans,
  idx_tup_read as tuples_read,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND indexname LIKE '%status%' OR indexname LIKE '%assigned%'
ORDER BY idx_scan DESC;

-- ============================================================================
-- END OF FILE
-- ============================================================================
