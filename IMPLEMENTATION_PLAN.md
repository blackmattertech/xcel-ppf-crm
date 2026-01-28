# Industry-Grade Lead Management System - Implementation Plan

**Generated:** 2026-01-28  
**Project:** XCEL CRM System  
**Status:** Draft for Review

---

## Executive Summary

This implementation plan addresses three critical objectives:

1. **Industry-Grade Features**: Implement Phase 1-5 requirements from the industry-grade lead management plan
2. **Performance Optimization**: Resolve UI rendering slowness and SQL query inefficiencies
3. **Code Quality**: Remove unnecessary API calls and optimize data fetching patterns

**Expected Outcomes:**
- 60-70% reduction in page load times
- 40-50% reduction in database queries
- Industry-standard lead scoring and assignment
- Enhanced SLA management and automation

---

## PART 1: CRITICAL PERFORMANCE FIXES (IMMEDIATE - Week 1)

> **Why First?** These fixes provide immediate value and improve user experience while we implement advanced features.

### Issue Analysis

#### **Root Causes of Slow UI:**

1. **Missing Pagination** (11 API endpoints)
   - `/api/analytics` fetches ALL leads in date range (could be 10K+ records)
   - `/api/products` with stats loads ALL leads + ALL orders into memory
   - `/api/leads` has no default pagination
   
2. **N+1 Query Patterns**
   - Analytics route: Fetches leads, then separately fetches user names
   - Product stats: Loads all leads, all orders, then filters in JavaScript
   - Assignment service: Fetches role, users, assignments separately

3. **Unnecessary API Calls**
   - 4 pages fetch ALL leads just to get count (should use `/api/leads/count`)
   - Dashboard makes sequential API calls (could be parallel)
   - Products fetched on lead detail page even when not needed

4. **Missing Memoization**
   - Leads page: Helper functions (`getVehicleName`, `getProductInterest`) recalculate on every render
   - Components like `GridView` and `KanbanBoard` re-render unnecessarily
   - Client-side filtering/sorting runs on every render

5. **Missing Composite Indexes**
   - No index on `leads(status, assigned_to)` for common tele-caller queries
   - No index on `leads(status, created_at)` for sorted queries
   - No index on `follow_ups(assigned_to, status, scheduled_at)` for pending queries

#### **Resolution Plan:**

### 1.1 Database Optimization (Priority: CRITICAL)

**File:** `database/migrations/015_performance_optimization.sql`

```sql
-- ============================================================================
-- PERFORMANCE OPTIMIZATION MIGRATION
-- ============================================================================

-- Composite indexes for common query patterns
CREATE INDEX CONCURRENTLY IF NOT EXISTS leads_status_assigned_to_idx 
  ON leads(status, assigned_to) 
  WHERE status != 'fully_paid';

CREATE INDEX CONCURRENTLY IF NOT EXISTS leads_status_created_at_idx 
  ON leads(status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS leads_source_status_idx 
  ON leads(source, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS leads_email_idx 
  ON leads(email) 
  WHERE email IS NOT NULL;

-- Follow-ups composite indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS follow_ups_assigned_status_scheduled_idx 
  ON follow_ups(assigned_to, status, scheduled_at) 
  WHERE status = 'pending';

CREATE INDEX CONCURRENTLY IF NOT EXISTS follow_ups_scheduled_status_idx 
  ON follow_ups(scheduled_at, status);

-- Quotations composite indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS quotations_lead_status_idx 
  ON quotations(lead_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS quotations_lead_version_idx 
  ON quotations(lead_id, version DESC);

-- Lead status history composite index
CREATE INDEX CONCURRENTLY IF NOT EXISTS lead_status_history_lead_created_idx 
  ON lead_status_history(lead_id, created_at DESC);

-- Calls composite index
CREATE INDEX CONCURRENTLY IF NOT EXISTS calls_lead_created_idx 
  ON calls(lead_id, created_at DESC);

-- Orders composite indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_customer_status_idx 
  ON orders(customer_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_created_at_idx 
  ON orders(created_at DESC);

-- Users indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS users_role_id_idx 
  ON users(role_id);

-- Products GIN index for text search (if needed)
CREATE INDEX CONCURRENTLY IF NOT EXISTS leads_requirement_gin_idx 
  ON leads USING GIN (to_tsvector('english', COALESCE(requirement, '')));

COMMENT ON INDEX leads_status_assigned_to_idx IS 'Optimizes queries filtering by status and assigned_to (common tele-caller query)';
COMMENT ON INDEX leads_status_created_at_idx IS 'Optimizes sorted queries by status and creation date';
COMMENT ON INDEX follow_ups_assigned_status_scheduled_idx IS 'Optimizes pending follow-ups queries per user';
```

**Estimated Impact:**
- 70% faster queries with status + assigned_to filters
- 60% faster analytics queries
- 50% faster follow-up notifications

---

### 1.2 API Route Optimization (Priority: CRITICAL)

#### Fix 1: Add Pagination to All List Endpoints

**Files to Modify:**
- `app/api/analytics/route.ts`
- `app/api/calls/route.ts`
- `app/api/customers/route.ts`
- `app/api/followups/route.ts`
- `app/api/leads/route.ts`
- `app/api/orders/route.ts`
- `app/api/products/route.ts`
- `app/api/quotations/route.ts`
- `app/api/users/route.ts`

**Implementation Pattern:**

```typescript
// Add to all list endpoints
const limit = parseInt(searchParams.get('limit') || '50', 10)
const offset = parseInt(searchParams.get('offset') || '0', 10)

const { data, error, count } = await supabase
  .from('table_name')
  .select('*', { count: 'exact' })
  .range(offset, offset + limit - 1)
  .order('created_at', { ascending: false })

return NextResponse.json({
  data,
  pagination: {
    total: count || 0,
    limit,
    offset,
    hasMore: (count || 0) > offset + limit
  }
})
```

#### Fix 2: Optimize Analytics Route (CRITICAL)

**File:** `app/api/analytics/route.ts`

**Current Issue:**
- Fetches ALL leads 4 times (by source, by status, for conversion, for rep performance)
- Fetches users separately (N+1)
- Client-side aggregation

**Optimized Implementation:**

```typescript
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    const supabase = createServiceClient()
    const searchParams = request.nextUrl.searchParams
    const startDate = searchParams.get('startDate') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const endDate = searchParams.get('endDate') || new Date().toISOString()

    // Single query for all aggregations using SQL
    const { data: aggregations } = await supabase.rpc('get_analytics_data', {
      p_start_date: startDate,
      p_end_date: endDate
    })

    return NextResponse.json(aggregations)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch analytics' },
      { status: 500 }
    )
  }
}
```

**Database Function:** `database/migrations/016_analytics_function.sql`

```sql
CREATE OR REPLACE FUNCTION get_analytics_data(
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  result JSONB;
BEGIN
  WITH lead_stats AS (
    SELECT 
      COUNT(*) as total_leads,
      COUNT(*) FILTER (WHERE status = 'converted') as converted_leads,
      jsonb_object_agg(source, count(*)) as leads_by_source,
      jsonb_object_agg(status, count(*)) as leads_by_status
    FROM leads
    WHERE created_at >= p_start_date AND created_at <= p_end_date
  ),
  rep_performance AS (
    SELECT 
      jsonb_agg(
        jsonb_build_object(
          'user_id', l.assigned_to,
          'user_name', u.name,
          'total_leads', COUNT(*),
          'converted_leads', COUNT(*) FILTER (WHERE l.status = 'converted'),
          'conversion_rate', ROUND((COUNT(*) FILTER (WHERE l.status = 'converted')::DECIMAL / COUNT(*)) * 100, 2)
        )
      ) as performance
    FROM leads l
    JOIN users u ON l.assigned_to = u.id
    WHERE l.created_at >= p_start_date 
      AND l.created_at <= p_end_date
      AND l.assigned_to IS NOT NULL
    GROUP BY l.assigned_to, u.name
  ),
  followup_stats AS (
    SELECT 
      COUNT(*) as total_followups,
      COUNT(*) FILTER (WHERE status = 'done') as completed_followups
    FROM follow_ups
    WHERE scheduled_at >= p_start_date AND scheduled_at <= p_end_date
  ),
  sla_stats AS (
    SELECT 
      COUNT(*) FILTER (
        WHERE first_contact_at IS NULL 
          OR (EXTRACT(EPOCH FROM (first_contact_at - created_at)) / 60) > 5
      ) as sla_breaches
    FROM leads
    WHERE created_at >= p_start_date 
      AND created_at <= p_end_date
      AND status = 'new'
  )
  SELECT jsonb_build_object(
    'leadsBySource', (SELECT leads_by_source FROM lead_stats),
    'leadsByStatus', (SELECT leads_by_status FROM lead_stats),
    'conversionRate', (
      SELECT CASE 
        WHEN total_leads > 0 
        THEN ROUND((converted_leads::DECIMAL / total_leads) * 100, 2)
        ELSE 0
      END
      FROM lead_stats
    ),
    'repPerformance', (SELECT COALESCE(performance, '[]'::jsonb) FROM rep_performance),
    'followUpCompliance', (
      SELECT CASE 
        WHEN total_followups > 0 
        THEN ROUND((completed_followups::DECIMAL / total_followups) * 100, 2)
        ELSE 0
      END
      FROM followup_stats
    ),
    'slaBreaches', (SELECT sla_breaches FROM sla_stats),
    'period', jsonb_build_object('startDate', p_start_date, 'endDate', p_end_date)
  ) INTO result;
  
  RETURN result;
END;
$$;
```

**Estimated Impact:** 80% faster analytics loading (from 4-5 queries to 1 query)

#### Fix 3: Optimize Product Stats (CRITICAL)

**File:** `backend/services/product.service.ts`

**Current Issue:**
- Loads ALL leads and ALL orders into memory
- Client-side filtering (O(n×m) complexity)

**Optimized Implementation:**

```typescript
export async function getProductsWithStats(): Promise<ProductWithStats[]> {
  const supabase = createServiceClient()
  
  // Use database aggregation instead of client-side processing
  const { data, error } = await supabase.rpc('get_products_with_stats')
  
  if (error) {
    throw new Error(`Failed to fetch products with stats: ${error.message}`)
  }
  
  return data || []
}
```

**Database Function:** `database/migrations/017_product_stats_function.sql`

```sql
CREATE OR REPLACE FUNCTION get_products_with_stats()
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  price NUMERIC,
  mrp NUMERIC,
  image_url TEXT,
  sku TEXT,
  is_active BOOLEAN,
  created_by UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  leads_interested BIGINT,
  customers_bought BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.title,
    p.description,
    p.price,
    p.mrp,
    p.image_url,
    p.sku,
    p.is_active,
    p.created_by,
    p.created_at,
    p.updated_at,
    -- Count leads with matching requirement (fuzzy match)
    (
      SELECT COUNT(*)
      FROM leads l
      WHERE l.requirement IS NOT NULL
        AND (
          -- Normalized matching (remove special chars, lowercase)
          LOWER(REGEXP_REPLACE(l.requirement, '[^a-z0-9]', '', 'gi')) 
            LIKE '%' || LOWER(REGEXP_REPLACE(p.title, '[^a-z0-9]', '', 'gi')) || '%'
          OR LOWER(REGEXP_REPLACE(p.title, '[^a-z0-9]', '', 'gi')) 
            LIKE '%' || LOWER(REGEXP_REPLACE(l.requirement, '[^a-z0-9]', '', 'gi')) || '%'
        )
    ) as leads_interested,
    -- Count orders with this product_id
    (
      SELECT COUNT(DISTINCT o.customer_id)
      FROM orders o
      WHERE o.product_id = p.id
    ) as customers_bought
  FROM products p
  ORDER BY p.created_at DESC;
END;
$$;
```

**Estimated Impact:** 95% faster product stats (from 3-5 seconds to <300ms)

---

### 1.3 Frontend Optimization (Priority: HIGH)

#### Fix 1: Remove Unnecessary Lead Count Fetches

**Files:**
- `app/quotations/page.tsx` (line 36)
- `app/products/page.tsx` (line 56)
- `app/orders/page.tsx` (line 37)
- `app/followups/page.tsx` (line 53)

**Current:**
```typescript
const { data: leads } = await supabase.from('leads').select('*')
const totalLeads = leads?.length || 0
```

**Fixed:**
```typescript
const response = await fetch('/api/leads/count')
const { count } = await response.json()
const totalLeads = count
```

**Estimated Impact:** 90% faster page loads (no longer fetching thousands of leads)

#### Fix 2: Parallelize API Calls

**File:** `app/dashboard/page.tsx`

**Current (Sequential):**
```typescript
await fetchAnalytics()     // Wait
await fetchFollowUpAlerts() // Wait
```

**Fixed (Parallel):**
```typescript
await Promise.all([
  fetchAnalytics(),
  fetchFollowUpAlerts()
])
```

**Files to Fix:**
- `app/dashboard/page.tsx` (lines 42-43)
- `app/leads/page.tsx` (multiple useEffects)
- `app/products/page.tsx` (lines 67-69)

**Estimated Impact:** 50% faster dashboard load

#### Fix 3: Memoize Heavy Components

**File:** `app/leads/page.tsx`

```typescript
import { useMemo, useCallback, memo } from 'react'

// Memoize helper functions
const getVehicleName = useCallback((metaData: any) => {
  // ... implementation
}, [])

const getProductInterest = useCallback((requirement: string | null, metaData: any) => {
  // ... implementation
}, [])

// Memoize components
const GridView = memo(({ leads, onLeadClick }: GridViewProps) => {
  // ... implementation
})

const KanbanBoard = memo(({ leads, onLeadClick }: KanbanBoardProps) => {
  // ... implementation
})

// Memoize filtered/sorted leads
const processedLeads = useMemo(() => {
  return leads
    .filter(/* ... */)
    .sort(/* ... */)
}, [leads, statusFilter, sourceFilter, sortBy])
```

**Estimated Impact:** 60% fewer re-renders

#### Fix 4: Lazy Load Products on Lead Detail Page

**File:** `app/leads/[id]/page.tsx`

**Current:**
```typescript
useEffect(() => {
  fetchLead()
  fetchProducts() // Always fetches, even if not needed
}, [])
```

**Fixed:**
```typescript
useEffect(() => {
  fetchLead()
}, [])

// Only fetch products when quotation modal opens
const handleOpenQuotationModal = () => {
  if (products.length === 0) {
    fetchProducts()
  }
  setIsQuotationModalOpen(true)
}
```

**Estimated Impact:** 40% faster lead detail page load

---

### 1.4 Backend Service Optimization (Priority: HIGH)

#### Fix 1: Optimize Batch Assignment

**File:** `backend/services/lead.service.ts` (lines 246-283)

**Current Issue:** Calls `assignLeadRoundRobin()` for each lead (N+1)

**Fixed Implementation:**

```typescript
// In createLeadsBatch
if (autoAssign) {
  // Fetch all assignments once
  const supabase = createServiceClient()
  
  const { data: roleData } = await supabase
    .from('roles')
    .select('id')
    .eq('name', 'tele_caller')
    .single()
  
  if (roleData) {
    const { data: users } = await supabase
      .from('users')
      .select('id, name')
      .eq('role_id', roleData.id)
    
    const { data: assignments } = await supabase
      .from('assignments')
      .select('*')
      .eq('lead_source', 'manual')
    
    // In-memory distribution
    const userAssignments = new Map(
      assignments?.map(a => [a.user_id, a]) || []
    )
    
    // Distribute leads
    let userIndex = 0
    const userIds = users?.map(u => u.id) || []
    
    for (const lead of createdLeads) {
      lead.assigned_to = userIds[userIndex % userIds.length]
      userIndex++
    }
    
    // Batch update leads
    await supabase
      .from('leads')
      .upsert(createdLeads.map(l => ({ id: l.id, assigned_to: l.assigned_to })))
  }
}
```

**Estimated Impact:** 90% faster batch assignment (from N queries to 3 queries)

#### Fix 2: Fix Race Conditions in Number Generation

**Files:**
- `backend/services/conversion.service.ts` (generateOrderNumber)
- `backend/services/quotation.service.ts` (generateQuoteNumber)

**Current Issue:** Using COUNT which has race conditions

**Fixed Implementation:**

```sql
-- Migration: 018_sequences.sql

CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS quote_number_seq START 1;

-- Function to generate order number
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  seq_val INTEGER;
  order_num TEXT;
BEGIN
  seq_val := nextval('order_number_seq');
  order_num := 'ORD-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD(seq_val::TEXT, 4, '0');
  RETURN order_num;
END;
$$;

-- Function to generate quote number
CREATE OR REPLACE FUNCTION generate_quote_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  seq_val INTEGER;
  quote_num TEXT;
BEGIN
  seq_val := nextval('quote_number_seq');
  quote_num := 'QUO-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD(seq_val::TEXT, 4, '0');
  RETURN quote_num;
END;
$$;
```

**Service Changes:**

```typescript
// backend/services/conversion.service.ts
export async function generateOrderNumber(): Promise<string> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('generate_order_number')
  if (error) throw new Error(`Failed to generate order number: ${error.message}`)
  return data
}

// backend/services/quotation.service.ts
export async function generateQuoteNumber(): Promise<string> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('generate_quote_number')
  if (error) throw new Error(`Failed to generate quote number: ${error.message}`)
  return data
}
```

---

## PART 2: INDUSTRY-GRADE FEATURES (Weeks 2-16)

### Phase 1: Foundation & Quick Wins (Weeks 2-3)

#### 1.1 Enhanced SLA Management

**Database Migration:** `database/migrations/019_enhanced_sla_system.sql`

```sql
-- SLA Rules Table
CREATE TABLE sla_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  lead_type TEXT NOT NULL CHECK (lead_type IN ('hot', 'warm', 'cold', 'meta', 'vip')),
  first_response_minutes INTEGER NOT NULL,
  qualification_hours INTEGER,
  followup_response_minutes INTEGER,
  quotation_delivery_hours INTEGER,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- SLA Violations Table
CREATE TABLE sla_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  sla_rule_id UUID REFERENCES sla_rules(id),
  violation_type TEXT NOT NULL CHECK (violation_type IN ('first_response', 'qualification', 'followup', 'quotation')),
  expected_at TIMESTAMPTZ NOT NULL,
  actual_at TIMESTAMPTZ,
  breach_minutes INTEGER,
  escalation_level INTEGER DEFAULT 1,
  escalated_at TIMESTAMPTZ,
  escalated_to UUID REFERENCES users(id),
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Escalation Rules Table
CREATE TABLE sla_escalation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sla_rule_id UUID NOT NULL REFERENCES sla_rules(id) ON DELETE CASCADE,
  escalation_level INTEGER NOT NULL,
  after_minutes INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('notify_rep', 'notify_supervisor', 'reassign', 'alert_admin')),
  escalate_to_role TEXT,
  auto_reassign BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX sla_violations_lead_id_idx ON sla_violations(lead_id);
CREATE INDEX sla_violations_created_at_idx ON sla_violations(created_at);
CREATE INDEX sla_violations_resolved_idx ON sla_violations(resolved_at) WHERE resolved_at IS NULL;

-- Default SLA Rules
INSERT INTO sla_rules (name, description, lead_type, first_response_minutes, qualification_hours, followup_response_minutes, quotation_delivery_hours) VALUES
  ('Hot Lead SLA', 'High priority leads require immediate attention', 'hot', 2, 4, 30, 12),
  ('Meta Lead SLA', 'Facebook/Instagram leads from paid ads', 'meta', 3, 6, 60, 24),
  ('Warm Lead SLA', 'Standard interested leads', 'warm', 5, 12, 120, 48),
  ('Cold Lead SLA', 'Low priority leads', 'cold', 15, 24, 240, 72);
```

**Backend Service:** `backend/services/sla.service.ts`

```typescript
import { createServiceClient } from '@/lib/supabase/service'

export async function checkSLACompliance(leadId: string) {
  const supabase = createServiceClient()
  
  // Get lead with SLA rule
  const { data: lead } = await supabase
    .from('leads')
    .select('*, sla_rules(*)')
    .eq('id', leadId)
    .single()
  
  if (!lead) return
  
  const slaRule = lead.sla_rules
  if (!slaRule) return
  
  // Check first response SLA
  if (!lead.first_contact_at) {
    const expectedAt = new Date(lead.created_at)
    expectedAt.setMinutes(expectedAt.getMinutes() + slaRule.first_response_minutes)
    
    if (new Date() > expectedAt) {
      await createSLAViolation(leadId, slaRule.id, 'first_response', expectedAt)
    }
  }
  
  // Check other SLAs...
}

async function createSLAViolation(leadId: string, slaRuleId: string, violationType: string, expectedAt: Date) {
  const supabase = createServiceClient()
  
  const breachMinutes = Math.floor((new Date().getTime() - expectedAt.getTime()) / (1000 * 60))
  
  await supabase.from('sla_violations').insert({
    lead_id: leadId,
    sla_rule_id: slaRuleId,
    violation_type: violationType,
    expected_at: expectedAt.toISOString(),
    breach_minutes: breachMinutes
  })
  
  // Trigger escalation
  await handleEscalation(leadId, slaRuleId, breachMinutes)
}

async function handleEscalation(leadId: string, slaRuleId: string, breachMinutes: number) {
  const supabase = createServiceClient()
  
  // Get escalation rules
  const { data: escalationRules } = await supabase
    .from('sla_escalation_rules')
    .select('*')
    .eq('sla_rule_id', slaRuleId)
    .lte('after_minutes', breachMinutes)
    .order('escalation_level', { ascending: false })
    .limit(1)
  
  if (escalationRules && escalationRules.length > 0) {
    const rule = escalationRules[0]
    
    switch (rule.action) {
      case 'notify_rep':
        // Send notification to assigned rep
        break
      case 'notify_supervisor':
        // Send notification to supervisor
        break
      case 'reassign':
        // Auto-reassign to available rep
        break
      case 'alert_admin':
        // Send alert to admin
        break
    }
  }
}
```

**API Route:** `app/api/sla/check/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/backend/middleware/auth'
import { checkSLACompliance } from '@/backend/services/sla.service'

// Cron job endpoint to check SLA compliance
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error
    
    // Check all active leads
    const supabase = createServiceClient()
    const { data: leads } = await supabase
      .from('leads')
      .select('id')
      .in('status', ['new', 'contacted', 'qualified', 'interested'])
    
    for (const lead of leads || []) {
      await checkSLACompliance(lead.id)
    }
    
    return NextResponse.json({ success: true, checked: leads?.length || 0 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check SLA compliance' },
      { status: 500 }
    )
  }
}
```

#### 1.2 Advanced Duplicate Detection

**Database Migration:** `database/migrations/020_duplicate_detection.sql`

```sql
-- Duplicate Candidates Table
CREATE TABLE duplicate_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id_1 UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  lead_id_2 UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  similarity_score NUMERIC(5,2) NOT NULL,
  match_type TEXT NOT NULL CHECK (match_type IN ('phone', 'email', 'name', 'combined')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'merged', 'not_duplicate', 'ignored')),
  master_lead_id UUID REFERENCES leads(id),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_duplicate_pair UNIQUE (lead_id_1, lead_id_2)
);

CREATE INDEX duplicate_candidates_status_idx ON duplicate_candidates(status);
CREATE INDEX duplicate_candidates_created_at_idx ON duplicate_candidates(created_at);

-- Function to detect duplicates
CREATE OR REPLACE FUNCTION detect_duplicates()
RETURNS TABLE (
  lead_id_1 UUID,
  lead_id_2 UUID,
  similarity_score NUMERIC,
  match_type TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  -- Phone duplicates
  SELECT 
    l1.id as lead_id_1,
    l2.id as lead_id_2,
    100.0 as similarity_score,
    'phone'::TEXT as match_type
  FROM leads l1
  JOIN leads l2 ON l1.phone = l2.phone AND l1.id < l2.id
  WHERE l1.phone IS NOT NULL
  
  UNION
  
  -- Email duplicates
  SELECT 
    l1.id as lead_id_1,
    l2.id as lead_id_2,
    100.0 as similarity_score,
    'email'::TEXT as match_type
  FROM leads l1
  JOIN leads l2 ON LOWER(l1.email) = LOWER(l2.email) AND l1.id < l2.id
  WHERE l1.email IS NOT NULL
  
  UNION
  
  -- Fuzzy name + phone match (Levenshtein distance)
  SELECT 
    l1.id as lead_id_1,
    l2.id as lead_id_2,
    ROUND(100.0 - (levenshtein(LOWER(l1.name), LOWER(l2.name))::NUMERIC / GREATEST(LENGTH(l1.name), LENGTH(l2.name)) * 100), 2) as similarity_score,
    'name'::TEXT as match_type
  FROM leads l1
  JOIN leads l2 ON 
    l1.id < l2.id
    AND levenshtein(LOWER(l1.name), LOWER(l2.name)) <= 3
    AND (
      l1.phone = l2.phone
      OR LOWER(l1.email) = LOWER(l2.email)
    )
  WHERE LENGTH(l1.name) > 3 AND LENGTH(l2.name) > 3;
END;
$$;
```

**Backend Service:** `backend/services/duplicate.service.ts`

```typescript
export async function scanForDuplicates() {
  const supabase = createServiceClient()
  
  const { data: duplicates } = await supabase.rpc('detect_duplicates')
  
  if (duplicates && duplicates.length > 0) {
    // Insert new duplicate candidates
    await supabase.from('duplicate_candidates').upsert(
      duplicates.map(d => ({
        lead_id_1: d.lead_id_1,
        lead_id_2: d.lead_id_2,
        similarity_score: d.similarity_score,
        match_type: d.match_type,
        status: 'pending'
      })),
      { onConflict: 'lead_id_1,lead_id_2', ignoreDuplicates: true }
    )
  }
  
  return duplicates?.length || 0
}

export async function mergeLeads(masterLeadId: string, duplicateLeadId: string, userId: string) {
  const supabase = createServiceClient()
  
  // Start transaction
  const { data: masterLead } = await supabase
    .from('leads')
    .select('*')
    .eq('id', masterLeadId)
    .single()
  
  const { data: duplicateLead } = await supabase
    .from('leads')
    .select('*')
    .eq('id', duplicateLeadId)
    .single()
  
  if (!masterLead || !duplicateLead) {
    throw new Error('Leads not found')
  }
  
  // Merge logic: Preserve non-null values from duplicate
  const mergedData = {
    ...masterLead,
    phone: masterLead.phone || duplicateLead.phone,
    email: masterLead.email || duplicateLead.email,
    requirement: masterLead.requirement || duplicateLead.requirement,
    // Preserve earliest created_at
    created_at: new Date(masterLead.created_at) < new Date(duplicateLead.created_at) 
      ? masterLead.created_at 
      : duplicateLead.created_at
  }
  
  // Update master lead
  await supabase
    .from('leads')
    .update(mergedData)
    .eq('id', masterLeadId)
  
  // Transfer related records
  await supabase.from('calls').update({ lead_id: masterLeadId }).eq('lead_id', duplicateLeadId)
  await supabase.from('follow_ups').update({ lead_id: masterLeadId }).eq('lead_id', duplicateLeadId)
  await supabase.from('quotations').update({ lead_id: masterLeadId }).eq('lead_id', duplicateLeadId)
  
  // Mark duplicate candidate as merged
  await supabase
    .from('duplicate_candidates')
    .update({
      status: 'merged',
      master_lead_id: masterLeadId,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString()
    })
    .or(`lead_id_1.eq.${duplicateLeadId},lead_id_2.eq.${duplicateLeadId}`)
  
  // Soft delete duplicate lead
  await supabase
    .from('leads')
    .delete()
    .eq('id', duplicateLeadId)
  
  return mergedData
}
```

#### 1.3 Data Enrichment & Validation

**Backend Service:** `backend/services/enrichment.service.ts`

```typescript
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js'

export async function enrichLead(leadId: string) {
  const supabase = createServiceClient()
  
  const { data: lead } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single()
  
  if (!lead) return
  
  const enrichedData: any = {}
  
  // Phone validation and formatting
  if (lead.phone) {
    const { isValid, formatted, country, type } = validateAndFormatPhone(lead.phone)
    if (isValid) {
      enrichedData.phone = formatted
      enrichedData.phone_country = country
      enrichedData.phone_type = type
    }
  }
  
  // Email validation
  if (lead.email) {
    const emailValid = await validateEmail(lead.email)
    enrichedData.email_valid = emailValid
    if (!emailValid) {
      enrichedData.email_validation_error = 'Invalid or disposable email'
    }
  }
  
  // Company enrichment (if available)
  if (lead.email) {
    const companyData = await enrichCompanyData(lead.email)
    if (companyData) {
      enrichedData.company_name = companyData.name
      enrichedData.company_size = companyData.size
      enrichedData.company_industry = companyData.industry
    }
  }
  
  // Update lead
  await supabase
    .from('leads')
    .update(enrichedData)
    .eq('id', leadId)
  
  return enrichedData
}

function validateAndFormatPhone(phone: string) {
  try {
    if (!isValidPhoneNumber(phone, 'IN')) {
      return { isValid: false }
    }
    
    const phoneNumber = parsePhoneNumber(phone, 'IN')
    return {
      isValid: true,
      formatted: phoneNumber.formatInternational(),
      country: phoneNumber.country,
      type: phoneNumber.getType()
    }
  } catch {
    return { isValid: false }
  }
}

async function validateEmail(email: string): Promise<boolean> {
  // Basic regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) return false
  
  // Check disposable domains
  const disposableDomains = ['tempmail.com', '10minutemail.com', 'guerrillamail.com']
  const domain = email.split('@')[1].toLowerCase()
  if (disposableDomains.includes(domain)) return false
  
  // Optional: Use external API for deep validation (e.g., Hunter.io, ZeroBounce)
  // const response = await fetch(`https://api.hunter.io/v2/email-verifier?email=${email}&api_key=...`)
  
  return true
}

async function enrichCompanyData(email: string) {
  const domain = email.split('@')[1]
  
  // Skip common email providers
  const commonProviders = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com']
  if (commonProviders.includes(domain)) return null
  
  // Optional: Use Clearbit, Hunter.io, or similar API
  // const response = await fetch(`https://company.clearbit.com/v1/domains/find?name=${domain}`)
  
  return null
}
```

---

### Phase 2: Intelligence & Scoring (Weeks 4-6)

#### 2.1 Lead Scoring Engine

**Database Migration:** `database/migrations/021_lead_scoring.sql`

```sql
-- Lead Scores Table
CREATE TABLE lead_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  total_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  demographic_score NUMERIC(5,2) DEFAULT 0,
  engagement_score NUMERIC(5,2) DEFAULT 0,
  fit_score NUMERIC(5,2) DEFAULT 0,
  source_score NUMERIC(5,2) DEFAULT 0,
  last_calculated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Score Factors Table (for audit trail)
CREATE TABLE score_factors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_score_id UUID NOT NULL REFERENCES lead_scores(id) ON DELETE CASCADE,
  factor_type TEXT NOT NULL,
  factor_name TEXT NOT NULL,
  score_value NUMERIC(5,2) NOT NULL,
  weight NUMERIC(3,2) NOT NULL,
  calculated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scoring Configuration Table
CREATE TABLE scoring_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_name TEXT NOT NULL UNIQUE,
  config_value JSONB NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX lead_scores_lead_id_idx ON lead_scores(lead_id);
CREATE INDEX lead_scores_total_score_idx ON lead_scores(total_score DESC);
CREATE INDEX lead_scores_updated_at_idx ON lead_scores(updated_at);

-- Default scoring configuration
INSERT INTO scoring_config (config_name, config_value, description) VALUES
  ('scoring_weights', '{
    "demographic": 0.20,
    "engagement": 0.30,
    "fit": 0.25,
    "source": 0.25
  }'::jsonb, 'Weight distribution for score components'),
  ('demographic_factors', '{
    "has_email": 10,
    "has_phone": 10,
    "has_requirement": 15,
    "has_budget_range": 20,
    "has_timeline": 15
  }'::jsonb, 'Points for demographic factors'),
  ('engagement_factors', '{
    "call_answered": 30,
    "email_opened": 15,
    "quotation_viewed": 25,
    "followup_engaged": 20
  }'::jsonb, 'Points for engagement activities'),
  ('source_quality', '{
    "meta": 80,
    "manual": 50,
    "form": 70,
    "whatsapp": 60,
    "ivr": 40
  }'::jsonb, 'Quality scores by lead source');

-- Function to calculate lead score
CREATE OR REPLACE FUNCTION calculate_lead_score(p_lead_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_lead RECORD;
  v_weights JSONB;
  v_demographic_factors JSONB;
  v_engagement_factors JSONB;
  v_source_quality JSONB;
  v_demographic_score NUMERIC := 0;
  v_engagement_score NUMERIC := 0;
  v_fit_score NUMERIC := 0;
  v_source_score NUMERIC := 0;
  v_total_score NUMERIC := 0;
  v_call_count INTEGER;
  v_quotation_count INTEGER;
  v_followup_count INTEGER;
BEGIN
  -- Get lead data
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Get scoring configuration
  SELECT config_value INTO v_weights FROM scoring_config WHERE config_name = 'scoring_weights' AND is_active = TRUE;
  SELECT config_value INTO v_demographic_factors FROM scoring_config WHERE config_name = 'demographic_factors' AND is_active = TRUE;
  SELECT config_value INTO v_engagement_factors FROM scoring_config WHERE config_name = 'engagement_factors' AND is_active = TRUE;
  SELECT config_value INTO v_source_quality FROM scoring_config WHERE config_name = 'source_quality' AND is_active = TRUE;
  
  -- Calculate demographic score (max 100)
  v_demographic_score := 0;
  IF v_lead.email IS NOT NULL THEN
    v_demographic_score := v_demographic_score + (v_demographic_factors->>'has_email')::NUMERIC;
  END IF;
  IF v_lead.phone IS NOT NULL THEN
    v_demographic_score := v_demographic_score + (v_demographic_factors->>'has_phone')::NUMERIC;
  END IF;
  IF v_lead.requirement IS NOT NULL THEN
    v_demographic_score := v_demographic_score + (v_demographic_factors->>'has_requirement')::NUMERIC;
  END IF;
  IF v_lead.budget_range IS NOT NULL THEN
    v_demographic_score := v_demographic_score + (v_demographic_factors->>'has_budget_range')::NUMERIC;
  END IF;
  IF v_lead.timeline IS NOT NULL THEN
    v_demographic_score := v_demographic_score + (v_demographic_factors->>'has_timeline')::NUMERIC;
  END IF;
  
  -- Calculate engagement score (max 100)
  v_engagement_score := 0;
  SELECT COUNT(*) INTO v_call_count FROM calls WHERE lead_id = p_lead_id AND outcome = 'answered';
  SELECT COUNT(*) INTO v_quotation_count FROM quotations WHERE lead_id = p_lead_id AND status IN ('viewed', 'accepted');
  SELECT COUNT(*) INTO v_followup_count FROM follow_ups WHERE lead_id = p_lead_id AND status = 'done';
  
  IF v_call_count > 0 THEN
    v_engagement_score := v_engagement_score + (v_engagement_factors->>'call_answered')::NUMERIC;
  END IF;
  IF v_quotation_count > 0 THEN
    v_engagement_score := v_engagement_score + (v_engagement_factors->>'quotation_viewed')::NUMERIC;
  END IF;
  IF v_followup_count > 0 THEN
    v_engagement_score := v_engagement_score + (v_engagement_factors->>'followup_engaged')::NUMERIC;
  END IF;
  
  -- Cap at 100
  v_engagement_score := LEAST(v_engagement_score, 100);
  
  -- Calculate fit score (max 100)
  v_fit_score := 50; -- Base score
  IF v_lead.interest_level = 'hot' THEN
    v_fit_score := 90;
  ELSIF v_lead.interest_level = 'warm' THEN
    v_fit_score := 70;
  ELSIF v_lead.interest_level = 'cold' THEN
    v_fit_score := 40;
  END IF;
  
  -- Calculate source score (max 100)
  v_source_score := COALESCE((v_source_quality->>v_lead.source)::NUMERIC, 50);
  
  -- Calculate total score (weighted average)
  v_total_score := 
    (v_demographic_score * (v_weights->>'demographic')::NUMERIC) +
    (v_engagement_score * (v_weights->>'engagement')::NUMERIC) +
    (v_fit_score * (v_weights->>'fit')::NUMERIC) +
    (v_source_score * (v_weights->>'source')::NUMERIC);
  
  -- Insert or update lead score
  INSERT INTO lead_scores (lead_id, total_score, demographic_score, engagement_score, fit_score, source_score, last_calculated_at)
  VALUES (p_lead_id, v_total_score, v_demographic_score, v_engagement_score, v_fit_score, v_source_score, NOW())
  ON CONFLICT (lead_id) DO UPDATE SET
    total_score = EXCLUDED.total_score,
    demographic_score = EXCLUDED.demographic_score,
    engagement_score = EXCLUDED.engagement_score,
    fit_score = EXCLUDED.fit_score,
    source_score = EXCLUDED.source_score,
    last_calculated_at = NOW(),
    updated_at = NOW();
  
  RETURN v_total_score;
END;
$$;

-- Trigger to recalculate score on lead update
CREATE OR REPLACE FUNCTION trigger_recalculate_score()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM calculate_lead_score(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER recalculate_score_on_lead_update
AFTER UPDATE ON leads
FOR EACH ROW
EXECUTE FUNCTION trigger_recalculate_score();
```

**Backend Service:** `backend/services/scoring.service.ts`

```typescript
export async function calculateLeadScore(leadId: string): Promise<number> {
  const supabase = createServiceClient()
  
  const { data, error } = await supabase.rpc('calculate_lead_score', {
    p_lead_id: leadId
  })
  
  if (error) {
    throw new Error(`Failed to calculate lead score: ${error.message}`)
  }
  
  return data || 0
}

export async function recalculateAllScores() {
  const supabase = createServiceClient()
  
  const { data: leads } = await supabase
    .from('leads')
    .select('id')
    .in('status', ['new', 'contacted', 'qualified', 'interested', 'negotiation'])
  
  let processed = 0
  for (const lead of leads || []) {
    await calculateLeadScore(lead.id)
    processed++
  }
  
  return processed
}

export async function getTopScoredLeads(limit: number = 20) {
  const supabase = createServiceClient()
  
  const { data: scores } = await supabase
    .from('lead_scores')
    .select(`
      *,
      lead:leads(*)
    `)
    .order('total_score', { ascending: false })
    .limit(limit)
  
  return scores || []
}
```

#### 2.2 Priority-Based Assignment

**Update:** `backend/services/assignment.service.ts`

```typescript
export async function assignLeadByPriority(leadId: string) {
  const supabase = createServiceClient()
  
  // Get lead score
  const { data: leadScore } = await supabase
    .from('lead_scores')
    .select('total_score')
    .eq('lead_id', leadId)
    .single()
  
  const score = leadScore?.total_score || 0
  
  // Get tele-callers with performance metrics
  const { data: roleData } = await supabase
    .from('roles')
    .select('id')
    .eq('name', 'tele_caller')
    .single()
  
  if (!roleData) return null
  
  const { data: users } = await supabase
    .from('users')
    .select(`
      id,
      name,
      user_performance_metrics(
        total_leads,
        converted_leads,
        conversion_rate
      )
    `)
    .eq('role_id', roleData.id)
  
  if (!users || users.length === 0) return null
  
  // Assign hot leads (score > 80) to top performers
  if (score > 80) {
    const topPerformers = users
      .sort((a, b) => (b.user_performance_metrics?.conversion_rate || 0) - (a.user_performance_metrics?.conversion_rate || 0))
      .slice(0, 3) // Top 3 performers
    
    // Round-robin among top performers
    const assignedUser = selectUserRoundRobin(topPerformers, 'meta')
    
    await supabase
      .from('leads')
      .update({ assigned_to: assignedUser.id })
      .eq('id', leadId)
    
    return assignedUser
  }
  
  // Normal round-robin for other leads
  return assignLeadRoundRobin(leadId, 'manual')
}

function selectUserRoundRobin(users: any[], source: string) {
  // ... existing round-robin logic
}
```

---

### Phase 3: Advanced Assignment & Automation (Weeks 7-9)

#### 3.1 Skill-Based Routing

**Database Migration:** `database/migrations/022_skill_based_routing.sql`

```sql
-- User Skills Table
CREATE TABLE user_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_type TEXT NOT NULL CHECK (skill_type IN ('product', 'industry', 'language', 'territory')),
  skill_value TEXT NOT NULL,
  proficiency_level TEXT CHECK (proficiency_level IN ('beginner', 'intermediate', 'expert')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assignment Rules Table
CREATE TABLE assignment_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  conditions JSONB NOT NULL,
  actions JSONB NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX user_skills_user_id_idx ON user_skills(user_id);
CREATE INDEX user_skills_skill_type_idx ON user_skills(skill_type, skill_value);
CREATE INDEX assignment_rules_priority_idx ON assignment_rules(priority DESC) WHERE is_active = TRUE;
```

**Backend Service:** `backend/services/routing.service.ts`

```typescript
export async function assignBySkillMatch(leadId: string) {
  const supabase = createServiceClient()
  
  const { data: lead } = await supabase
    .from('leads')
    .select('*, lead_scores(*)')
    .eq('id', leadId)
    .single()
  
  if (!lead) return null
  
  // Extract required skills from lead
  const requiredSkills = extractRequiredSkills(lead)
  
  // Get users with matching skills
  const { data: matchingUsers } = await supabase
    .from('user_skills')
    .select('user_id, users(*)')
    .in('skill_value', requiredSkills)
  
  if (!matchingUsers || matchingUsers.length === 0) {
    // Fall back to normal assignment
    return assignLeadByPriority(leadId)
  }
  
  // Calculate match score for each user
  const usersWithScores = matchingUsers.map(us => ({
    user: us.users,
    matchScore: calculateMatchScore(requiredSkills, us.user_id)
  }))
  
  // Assign to best match
  const bestMatch = usersWithScores.sort((a, b) => b.matchScore - a.matchScore)[0]
  
  await supabase
    .from('leads')
    .update({ assigned_to: bestMatch.user.id })
    .eq('id', leadId)
  
  return bestMatch.user
}

function extractRequiredSkills(lead: any): string[] {
  const skills: string[] = []
  
  // Extract from requirement
  if (lead.requirement) {
    // Map requirements to skills
    const requirementMap: Record<string, string[]> = {
      'paint_protection_film': ['ppf', 'detailing'],
      'ceramic_coating': ['ceramic', 'detailing'],
      'detailing': ['detailing', 'car_care']
    }
    
    for (const [key, values] of Object.entries(requirementMap)) {
      if (lead.requirement.toLowerCase().includes(key)) {
        skills.push(...values)
      }
    }
  }
  
  return skills
}

function calculateMatchScore(requiredSkills: string[], userId: string): number {
  // ... implementation
  return 0
}
```

#### 3.2 Lead Nurturing System

**Database Migration:** `database/migrations/023_nurturing_system.sql`

```sql
-- Nurture Campaigns Table
CREATE TABLE nurture_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('status_change', 'time_based', 'score_threshold', 'manual')),
  trigger_conditions JSONB NOT NULL,
  campaign_type TEXT CHECK (campaign_type IN ('drip', 'sequence', 'one_time')),
  steps JSONB NOT NULL, -- Array of campaign steps
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Nurture Enrollments Table
CREATE TABLE nurture_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES nurture_campaigns(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  current_step INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'failed')),
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  last_action_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE(campaign_id, lead_id)
);

-- Nurture Actions Log
CREATE TABLE nurture_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES nurture_enrollments(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  action_type TEXT NOT NULL,
  action_details JSONB,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  scheduled_at TIMESTAMPTZ NOT NULL,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX nurture_enrollments_lead_id_idx ON nurture_enrollments(lead_id);
CREATE INDEX nurture_actions_scheduled_at_idx ON nurture_actions(scheduled_at) WHERE status = 'pending';
```

---

### Phase 4: Analytics & Intelligence (Weeks 10-12)

#### 4.1 Advanced Analytics Dashboard

**Database Function:** `database/migrations/024_advanced_analytics.sql`

```sql
-- Pipeline velocity metrics
CREATE OR REPLACE FUNCTION get_pipeline_velocity(p_start_date TIMESTAMPTZ, p_end_date TIMESTAMPTZ)
RETURNS TABLE (
  stage TEXT,
  avg_time_in_stage NUMERIC,
  conversion_rate NUMERIC,
  drop_off_count BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH stage_transitions AS (
    SELECT 
      lead_id,
      old_status,
      new_status,
      created_at,
      LEAD(created_at) OVER (PARTITION BY lead_id ORDER BY created_at) as next_change,
      EXTRACT(EPOCH FROM (
        LEAD(created_at) OVER (PARTITION BY lead_id ORDER BY created_at) - created_at
      )) / 3600 as hours_in_stage
    FROM lead_status_history
    WHERE created_at >= p_start_date AND created_at <= p_end_date
  )
  SELECT 
    old_status as stage,
    ROUND(AVG(hours_in_stage), 2) as avg_time_in_stage,
    ROUND(
      (COUNT(*) FILTER (WHERE new_status != 'lost')::DECIMAL / COUNT(*)) * 100, 
      2
    ) as conversion_rate,
    COUNT(*) FILTER (WHERE new_status = 'lost') as drop_off_count
  FROM stage_transitions
  WHERE hours_in_stage IS NOT NULL
  GROUP BY old_status;
END;
$$;

-- Source ROI analysis
CREATE OR REPLACE FUNCTION get_source_roi(p_start_date TIMESTAMPTZ, p_end_date TIMESTAMPTZ)
RETURNS TABLE (
  source TEXT,
  total_leads BIGINT,
  converted_leads BIGINT,
  conversion_rate NUMERIC,
  total_revenue NUMERIC,
  avg_revenue_per_lead NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.source,
    COUNT(DISTINCT l.id) as total_leads,
    COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'converted') as converted_leads,
    ROUND(
      (COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'converted')::DECIMAL / COUNT(DISTINCT l.id)) * 100,
      2
    ) as conversion_rate,
    COALESCE(SUM(o.payment_amount), 0) as total_revenue,
    COALESCE(SUM(o.payment_amount) / COUNT(DISTINCT l.id), 0) as avg_revenue_per_lead
  FROM leads l
  LEFT JOIN customers c ON c.lead_id = l.id
  LEFT JOIN orders o ON o.customer_id = c.id AND o.payment_status = 'paid'
  WHERE l.created_at >= p_start_date AND l.created_at <= p_end_date
  GROUP BY l.source;
END;
$$;

-- Cohort analysis
CREATE OR REPLACE FUNCTION get_cohort_analysis(p_start_date TIMESTAMPTZ, p_end_date TIMESTAMPTZ)
RETURNS TABLE (
  cohort_month TEXT,
  total_leads BIGINT,
  converted_count BIGINT,
  conversion_rate NUMERIC,
  avg_time_to_conversion NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    TO_CHAR(DATE_TRUNC('month', l.created_at), 'YYYY-MM') as cohort_month,
    COUNT(*) as total_leads,
    COUNT(*) FILTER (WHERE l.status = 'converted') as converted_count,
    ROUND(
      (COUNT(*) FILTER (WHERE l.status = 'converted')::DECIMAL / COUNT(*)) * 100,
      2
    ) as conversion_rate,
    ROUND(
      AVG(
        EXTRACT(EPOCH FROM (l.converted_at - l.created_at)) / 86400
      ) FILTER (WHERE l.converted_at IS NOT NULL),
      2
    ) as avg_time_to_conversion
  FROM leads l
  WHERE l.created_at >= p_start_date AND l.created_at <= p_end_date
  GROUP BY DATE_TRUNC('month', l.created_at)
  ORDER BY cohort_month;
END;
$$;
```

**API Routes:**

`app/api/analytics/pipeline-velocity/route.ts`
`app/api/analytics/source-roi/route.ts`
`app/api/analytics/cohort-analysis/route.ts`

#### 4.2 Predictive Analytics

**Backend Service:** `backend/services/predictive.service.ts`

```typescript
// Win probability model (simplified - use ML library in production)
export async function calculateWinProbability(leadId: string): Promise<number> {
  const supabase = createServiceClient()
  
  const { data: lead } = await supabase
    .from('leads')
    .select(`
      *,
      lead_scores(*),
      calls(count),
      follow_ups(count),
      quotations(count)
    `)
    .eq('id', leadId)
    .single()
  
  if (!lead) return 0
  
  // Simplified probability calculation
  let probability = 0
  
  // Base score contribution (40%)
  probability += (lead.lead_scores?.total_score || 0) * 0.4
  
  // Engagement contribution (30%)
  const callCount = lead.calls?.[0]?.count || 0
  const quotationCount = lead.quotations?.[0]?.count || 0
  const engagementScore = Math.min((callCount * 10) + (quotationCount * 20), 100)
  probability += engagementScore * 0.3
  
  // Time factor (20%)
  const daysSinceCreated = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24))
  const timeScore = Math.max(100 - (daysSinceCreated * 2), 0)
  probability += timeScore * 0.2
  
  // Status factor (10%)
  const statusScores: Record<string, number> = {
    'qualified': 70,
    'interested': 80,
    'negotiation': 90,
    'quotation_viewed': 85,
    'quotation_accepted': 95
  }
  probability += (statusScores[lead.status] || 30) * 0.1
  
  return Math.min(Math.round(probability), 100)
}

// Churn risk score
export async function calculateChurnRisk(leadId: string): Promise<number> {
  const supabase = createServiceClient()
  
  const { data: lead } = await supabase
    .from('leads')
    .select(`
      *,
      follow_ups(
        status,
        scheduled_at,
        completed_at
      )
    `)
    .eq('id', leadId)
    .single()
  
  if (!lead) return 0
  
  let risk = 0
  
  // Days since last contact
  const lastContactDate = lead.follow_ups
    ?.filter((f: any) => f.status === 'done')
    .sort((a: any, b: any) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())[0]?.completed_at
  
  if (lastContactDate) {
    const daysSinceContact = Math.floor((Date.now() - new Date(lastContactDate).getTime()) / (1000 * 60 * 60 * 24))
    if (daysSinceContact > 7) risk += 30
    if (daysSinceContact > 14) risk += 30
    if (daysSinceContact > 21) risk += 20
  } else {
    risk += 50 // No contact at all
  }
  
  // Missed follow-ups
  const missedFollowups = lead.follow_ups?.filter((f: any) => 
    f.status === 'pending' && new Date(f.scheduled_at) < new Date()
  ).length || 0
  
  risk += Math.min(missedFollowups * 10, 30)
  
  // Status factor
  if (lead.status === 'lost' || lead.status === 'unqualified') {
    risk = 100
  }
  
  return Math.min(Math.round(risk), 100)
}
```

---

### Phase 5: Ecosystem & Optimization (Weeks 13-16)

#### 5.1 Integration Hub

**Mailjet Email Integration** (already exists - enhance)
**SMS Gateway Integration** (Twilio)
**WhatsApp Business API Integration**

**Backend Service:** `backend/services/integrations/sms.service.ts`

```typescript
import twilio from 'twilio'

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)

export async function sendSMS(to: string, message: string) {
  try {
    const result = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: to
    })
    
    return { success: true, sid: result.sid }
  } catch (error) {
    console.error('SMS send error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export async function sendBulkSMS(recipients: string[], message: string) {
  const results = await Promise.all(
    recipients.map(to => sendSMS(to, message))
  )
  
  return {
    total: recipients.length,
    sent: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length
  }
}
```

#### 5.2 Lead Recycle System

**Database Migration:** `database/migrations/025_recycle_system.sql`

```sql
-- Recycle Rules Table
CREATE TABLE recycle_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status_to_recycle TEXT NOT NULL,
  days_after INTEGER NOT NULL,
  recycle_to_status TEXT DEFAULT 'new',
  reassign BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recycled Leads Log
CREATE TABLE recycled_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  original_status TEXT NOT NULL,
  recycled_at TIMESTAMPTZ DEFAULT NOW(),
  recycled_by TEXT DEFAULT 'system',
  notes TEXT
);

-- Default recycle rules
INSERT INTO recycle_rules (name, status_to_recycle, days_after, recycle_to_status, reassign) VALUES
  ('Recycle Lost Leads', 'lost', 90, 'new', TRUE),
  ('Recycle Cold Leads', 'contacted', 30, 'new', FALSE),
  ('Recycle Unqualified', 'unqualified', 180, 'new', TRUE);

-- Function to recycle leads
CREATE OR REPLACE FUNCTION recycle_leads()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_recycled_count INTEGER := 0;
  v_rule RECORD;
  v_lead RECORD;
BEGIN
  FOR v_rule IN SELECT * FROM recycle_rules WHERE is_active = TRUE LOOP
    FOR v_lead IN 
      SELECT id, status 
      FROM leads 
      WHERE status = v_rule.status_to_recycle
        AND updated_at < NOW() - (v_rule.days_after || ' days')::INTERVAL
    LOOP
      -- Update lead status
      UPDATE leads 
      SET 
        status = v_rule.recycle_to_status,
        assigned_to = CASE WHEN v_rule.reassign THEN NULL ELSE assigned_to END,
        updated_at = NOW()
      WHERE id = v_lead.id;
      
      -- Log recycle action
      INSERT INTO recycled_leads (lead_id, original_status, recycled_by, notes)
      VALUES (v_lead.id, v_lead.status, 'system', 'Auto-recycled by rule: ' || v_rule.name);
      
      v_recycled_count := v_recycled_count + 1;
    END LOOP;
  END LOOP;
  
  RETURN v_recycled_count;
END;
$$;
```

---

## PART 3: IMPLEMENTATION TIMELINE & MILESTONES

### Week 1: Critical Performance Fixes
- [ ] Day 1-2: Database indexes migration
- [ ] Day 3-4: API route pagination
- [ ] Day 5-6: Frontend optimization (memoization, parallel calls)
- [ ] Day 7: Testing and benchmarking
- **Milestone:** 60% faster page loads

### Weeks 2-3: Phase 1 - Foundation
- [ ] Enhanced SLA management
- [ ] Advanced duplicate detection
- [ ] Data enrichment service
- **Milestone:** Improved data quality and SLA compliance

### Weeks 4-6: Phase 2 - Intelligence
- [ ] Lead scoring engine
- [ ] Priority-based assignment
- **Milestone:** Intelligent lead distribution

### Weeks 7-9: Phase 3 - Automation
- [ ] Skill-based routing
- [ ] Lead nurturing campaigns
- [ ] Activity timeline
- **Milestone:** Automated workflows

### Weeks 10-12: Phase 4 - Analytics
- [ ] Advanced analytics dashboard
- [ ] Predictive analytics
- [ ] Performance benchmarking
- **Milestone:** Data-driven insights

### Weeks 13-16: Phase 5 - Ecosystem
- [ ] SMS/WhatsApp integration
- [ ] Lead recycle system
- [ ] Custom fields & forms
- **Milestone:** Complete ecosystem

---

## PART 4: TESTING & VALIDATION

### Performance Testing Checklist

#### Before Optimization (Baseline)
- [ ] Dashboard page load time: ______ ms
- [ ] Leads list page load time: ______ ms
- [ ] Analytics API response time: ______ ms
- [ ] Product stats API response time: ______ ms
- [ ] Database query count per page: ______

#### After Optimization (Target)
- [ ] Dashboard page load time: < 500ms (60% reduction)
- [ ] Leads list page load time: < 800ms (70% reduction)
- [ ] Analytics API response time: < 300ms (80% reduction)
- [ ] Product stats API response time: < 300ms (95% reduction)
- [ ] Database query count per page: 50% reduction

### Feature Testing

#### Phase 1 Testing
- [ ] SLA violations detected correctly
- [ ] Escalations triggered at right time
- [ ] Duplicate detection accuracy > 95%
- [ ] Email/phone validation working

#### Phase 2 Testing
- [ ] Lead scores calculated correctly
- [ ] Hot leads assigned to top performers
- [ ] Score recalculation on activity

#### Phase 3 Testing
- [ ] Skill matching works correctly
- [ ] Nurture campaigns send on schedule
- [ ] Activity timeline shows all events

#### Phase 4 Testing
- [ ] Pipeline velocity metrics accurate
- [ ] Win probability predictions reasonable
- [ ] Churn risk scores useful

#### Phase 5 Testing
- [ ] SMS/email sending works
- [ ] Lead recycling runs correctly
- [ ] Custom fields save and retrieve

---

## PART 5: ROLLOUT STRATEGY

### Phase 1: Staging Environment
1. Deploy all performance fixes
2. Run load tests (simulate 1000 concurrent users)
3. Monitor query performance
4. Fix any regressions

### Phase 2: Canary Release (10% of users)
1. Deploy to 10% of users
2. Monitor error rates and performance
3. Collect user feedback
4. Adjust based on feedback

### Phase 3: Gradual Rollout (50% of users)
1. Deploy to 50% of users
2. Monitor for 3-5 days
3. Ensure stability

### Phase 4: Full Release (100% of users)
1. Deploy to all users
2. Monitor closely for 1 week
3. Provide training materials
4. Offer support channel

---

## PART 6: MONITORING & SUCCESS METRICS

### Performance Metrics
- Page load time (target: < 1s for 95th percentile)
- API response time (target: < 500ms for 95th percentile)
- Database query time (target: < 100ms for 95th percentile)
- Error rate (target: < 0.1%)

### Business Metrics
- Lead response time (target: < 3 minutes average)
- Conversion rate (target: 15-20%)
- SLA compliance (target: > 95%)
- Duplicate rate (target: < 2%)
- Follow-up compliance (target: > 95%)
- Lead-to-customer time (target: < 30 days)

### User Adoption Metrics
- Daily active users
- Feature usage rates
- User satisfaction scores
- Support ticket volume

---

## PART 7: RISK MITIGATION

### Technical Risks
- **Database migration failures**: Test on staging first, backup before migration
- **Performance regressions**: Monitor closely, have rollback plan
- **Data loss**: Regular backups, test restore procedures

### Business Risks
- **User resistance to changes**: Provide training, collect feedback early
- **Feature complexity**: Phased rollout, clear documentation
- **Cost overruns**: Monitor API usage, set budgets and alerts

---

## APPENDIX A: FILE STRUCTURE

### New Files Created
```
database/
  migrations/
    015_performance_optimization.sql
    016_analytics_function.sql
    017_product_stats_function.sql
    018_sequences.sql
    019_enhanced_sla_system.sql
    020_duplicate_detection.sql
    021_lead_scoring.sql
    022_skill_based_routing.sql
    023_nurturing_system.sql
    024_advanced_analytics.sql
    025_recycle_system.sql

backend/
  services/
    sla.service.ts
    duplicate.service.ts
    enrichment.service.ts
    scoring.service.ts
    routing.service.ts
    nurturing.service.ts
    predictive.service.ts
    integrations/
      sms.service.ts
      whatsapp.service.ts

app/
  api/
    sla/
      check/route.ts
    duplicates/
      scan/route.ts
      merge/route.ts
    scoring/
      calculate/route.ts
      recalculate-all/route.ts
    analytics/
      pipeline-velocity/route.ts
      source-roi/route.ts
      cohort-analysis/route.ts
    nurturing/
      campaigns/route.ts
      enroll/route.ts
    recycle/
      run/route.ts
```

### Modified Files
```
backend/services/
  assignment.service.ts (optimized)
  lead.service.ts (optimized batch assignment)
  product.service.ts (optimized stats calculation)
  conversion.service.ts (fixed race condition)
  quotation.service.ts (fixed race condition)

app/api/
  analytics/route.ts (optimized queries)
  leads/route.ts (added pagination)
  products/route.ts (optimized)
  calls/route.ts (added pagination)
  customers/route.ts (added pagination)
  followups/route.ts (added pagination)
  orders/route.ts (added pagination)
  quotations/route.ts (added pagination)
  users/route.ts (added pagination)

app/
  dashboard/page.tsx (parallel API calls, memoization)
  leads/page.tsx (memoization, lazy loading)
  leads/[id]/page.tsx (lazy product loading)
  quotations/page.tsx (use count API)
  products/page.tsx (use count API)
  orders/page.tsx (use count API)
  followups/page.tsx (use count API)
```

---

## APPENDIX B: ENVIRONMENT VARIABLES

Add to `.env.local`:

```bash
# Twilio SMS (Phase 5)
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=+1234567890

# WhatsApp Business API (Phase 5)
WHATSAPP_API_KEY=your_whatsapp_key
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id

# Enrichment APIs (Phase 1)
HUNTER_IO_API_KEY=your_hunter_io_key
CLEARBIT_API_KEY=your_clearbit_key

# Feature Flags
ENABLE_LEAD_SCORING=true
ENABLE_AUTO_ASSIGNMENT=true
ENABLE_SLA_MONITORING=true
ENABLE_NURTURING=true
```

---

## Next Steps

1. **Review and Approve** this implementation plan
2. **Prioritize** features based on business needs
3. **Allocate Resources** (developers, time, budget)
4. **Set Up Staging Environment** for testing
5. **Begin Week 1** (Critical Performance Fixes)

---

**End of Implementation Plan**
