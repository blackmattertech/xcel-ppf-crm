-- Per-user opt-in for automatic new-lead assignment (round-robin).
-- When false, user keeps existing assigned leads but is skipped for new auto-assignments.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS receives_new_lead_assignments BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.users.receives_new_lead_assignments IS
  'If true, user may receive new leads via round-robin. If false, existing assignments unchanged but no new auto-assignments.';
