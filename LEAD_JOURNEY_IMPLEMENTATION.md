# Lead Journey Implementation - Progress

## ✅ Completed

1. **Database Migration** (`011_lead_journey_statuses.sql`):
   - Added `contacted` and `discarded` statuses
   - Added quotation rejection fields (rejection_reason, rejected_at, rejected_by, admin_notified)

2. **Status Constants** (`shared/constants/lead-status.ts`):
   - Added CONTACTED and DISCARDED to LEAD_STATUS
   - Updated labels and icons
   - Updated LEAD_STATUS_FLOW to include contacted transitions

3. **Call API** (`app/api/calls/route.ts`):
   - Updates status: new → contacted on first call attempt
   - Wrong Number → status = lost (discarded)
   - Not Reachable / Call Later → status = contacted (if was new)
   - Creates follow-ups for not_reachable/call_later

4. **Lead Update Schema** (`app/api/leads/[id]/route.ts`):
   - Added `contacted` and `discarded` to status enum

## 🔄 In Progress

5. **Frontend Call Modal** (`app/leads/[id]/page.tsx`):
   - Added state for Connected sub-options (interested, not_interested, call_later)
   - Need to update modal UI to show sub-options when Connected is selected
   - Need to update handleCallStatusUpdate to handle new flow

## 📋 Remaining Tasks

6. **Connected Flow Implementation**:
   - When Connected → show sub-options: Interested, Not Interested, Call Later
   - Interested → show form (Lead Type, Product Interest, Budget, Notes) → status = qualified
   - Not Interested → status = lost (discarded)
   - Call Later → create follow-up, status = contacted

7. **Stats Calculation**:
   - Update `app/leads/page.tsx` stats to include: Untouched, Contacted, Qualified, Negotiation, Won, Discarded
   - Update `app/api/analytics/route.ts` to reflect new stats buckets

8. **Quotation Rejection**:
   - Add rejection reason tracking in quotation service
   - Add admin notification for rejections
   - Update quotation status update API

9. **Admin Reassignment**:
   - Ensure reassignment transfers full history
   - Add notification system for admins

## Notes

- Status "discarded" maps to "lost" in some contexts for backward compatibility
- Stats bucket can be computed from status + first_contact_at (no need for separate field)
- All status changes are already audited via lead_status_history table
