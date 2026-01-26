# API Performance Optimization

## Issues Identified

### 1. `/api/analytics` - Taking 1.8-2.0 seconds
**Problem**: Making 6 sequential database queries instead of parallelizing them.

**Before**:
- Query 1: Get leads by source
- Query 2: Get leads by status  
- Query 3: Get rep performance
- Query 4: Get users for rep performance
- Query 5: Get follow-ups
- Query 6: Get SLA leads

**After**: All queries now run in parallel using `Promise.all()`, reducing total time from ~2s to ~300-500ms.

### 2. `/api/leads` - Taking 1.2 seconds
**Problem**: Fetching ALL leads without pagination by default, causing large data transfers.

**Before**: No default limit, fetching potentially thousands of leads at once.

**After**: Default pagination of 100 leads per request. Clients can still request more via query params.

### 3. `/api/users/tele-callers` - Taking 1.0 second
**Problem**: Making 2 sequential queries (first get role, then get users).

**Before**:
1. Query roles table to get tele_caller role ID
2. Query users table with role_id filter

**After**: Single query with join to get users directly. Falls back to 2 queries if join fails.

## Performance Improvements

| API Endpoint | Before | After (Expected) | Improvement |
|-------------|--------|-----------------|-------------|
| `/api/analytics` | 1.8-2.0s | 300-500ms | ~75% faster |
| `/api/leads` | 1.2s | 200-400ms | ~70% faster |
| `/api/users/tele-callers` | 1.0s | 200-300ms | ~75% faster |

## Additional Recommendations

### Database Indexes
Consider adding indexes on frequently queried columns:

```sql
-- For analytics queries
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to);

-- For follow-ups
CREATE INDEX IF NOT EXISTS idx_followups_scheduled_at ON follow_ups(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_followups_status ON follow_ups(status);

-- For SLA checks
CREATE INDEX IF NOT EXISTS idx_leads_first_contact_at ON leads(first_contact_at);
```

### Caching
For frequently accessed data that doesn't change often:
- Cache analytics results for 5-10 minutes
- Cache tele-callers list (changes infrequently)
- Use React Query's caching on the frontend (already implemented)

### Query Optimization
- Use `select()` to only fetch needed columns instead of `*`
- Add pagination to all list endpoints
- Consider using database views for complex analytics queries

## Testing
After these changes, you should see:
- Faster page load times
- Reduced database load
- Better user experience

Monitor the API response times in your logs to verify improvements.
