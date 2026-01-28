# Lead Journey Implementation - Analysis Summary

## Current State

### ✅ Already Implemented
1. **Round-robin Assignment**: `assignment.service.ts` - fully functional
2. **Deduplication**: `lead.service.ts` - checks by phone number on create
3. **Call System**: `calls` table with outcomes (connected, not_reachable, wrong_number, call_later)
4. **Follow-ups**: `follow_ups` table with scheduling
5. **Quotations**: `quotations` table with status tracking
6. **Status History**: `lead_status_history` table for audit trail
7. **Auto-assignment**: Happens in `createLead` and `createLeadsBatch`

### 📋 Current Status Values
- new, qualified, unqualified, quotation_shared, quotation_viewed, quotation_accepted, quotation_expired
- interested, negotiation, lost, converted, deal_won
- payment_pending, advance_received, fully_paid

### 🔄 Current Call Flow (Partial)
- Call modal exists in `app/leads/[id]/page.tsx`
- Handles: Connected, Not Reachable, Wrong Number, Call Later
- Updates `first_contact_at` on first call
- Creates follow-ups for not_reachable/call_later

## Required Changes

### 1. Database Changes
- Add "contacted" status to leads table CHECK constraint
- Add "discarded" status (or map to "lost")
- Add `quotation_rejection_reason` field to quotations table
- Add `stats_bucket` computed field or use status for stats

### 2. Backend Changes
- Update call API to change status: new → contacted on first call
- Implement Connected flow with sub-options:
  - Interested → show form → status = qualified
  - Not Interested → status = lost (discarded)
  - Call Later → follow-up + status = contacted
- Update Wrong Number → status = lost (discarded)
- Add quotation rejection reason tracking
- Add admin notification for quotation rejections

### 3. Frontend Changes
- Update call modal to show Connected sub-options
- Add "Interested" form modal (Lead Type, Product Interest, Budget, Notes)
- Update status transitions based on call outcomes
- Add admin notification UI for quotation rejections
- Update stats cards to show: Untouched, Contacted, Qualified, Negotiation, Won, Discarded

### 4. Stats Updates
- Untouched: status = 'new' AND first_contact_at IS NULL
- Contacted: status = 'contacted'
- Qualified: status = 'qualified'
- Negotiation: status = 'negotiation'
- Won: status = 'deal_won' OR status = 'converted'
- Discarded: status = 'lost'

## Implementation Plan
1. Database migration for new statuses
2. Update backend services (call, lead, quotation)
3. Update frontend call flow UI
4. Update stats calculation
5. Add admin notification system
