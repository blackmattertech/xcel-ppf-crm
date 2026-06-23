-- Sub-buckets: one level under a parent bucket (parent_id -> lead_buckets).

ALTER TABLE public.lead_buckets
    ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.lead_buckets(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS lead_buckets_parent_id_idx ON public.lead_buckets(parent_id);

-- Top-level names unique; sub-bucket names unique per parent.
ALTER TABLE public.lead_buckets DROP CONSTRAINT IF EXISTS lead_buckets_name_unique;

CREATE UNIQUE INDEX IF NOT EXISTS lead_buckets_top_level_name_unique
    ON public.lead_buckets (lower(trim(name)))
    WHERE parent_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS lead_buckets_sub_name_unique
    ON public.lead_buckets (parent_id, lower(trim(name)))
    WHERE parent_id IS NOT NULL;

COMMENT ON COLUMN public.lead_buckets.parent_id IS 'Optional parent bucket; sub-buckets are one level deep only.';
