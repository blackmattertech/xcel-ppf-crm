-- Aggregated counts and analytics to avoid transferring full row sets to the app tier.

CREATE OR REPLACE FUNCTION public.get_lead_counts_by_status(p_assigned_to uuid DEFAULT NULL)
RETURNS TABLE(status text, cnt bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(l.status, 'unknown')::text AS status, COUNT(*)::bigint AS cnt
  FROM public.leads l
  WHERE l.status IS DISTINCT FROM 'fully_paid'
    AND (p_assigned_to IS NULL OR l.assigned_to = p_assigned_to)
  GROUP BY l.status;
$$;

CREATE OR REPLACE FUNCTION public.get_analytics_dashboard(
  p_start timestamptz,
  p_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_src jsonb;
  v_st jsonb;
  v_total int;
  v_conv int;
  v_rate numeric;
  v_rep jsonb;
  v_fu numeric;
  v_sla int;
  v_time jsonb;
  v_int jsonb;
  v_cprod jsonb;
  converted_arr text[] := ARRAY[
    'converted',
    'deal_won',
    'fully_paid',
    'advance_received',
    'payment_pending'
  ];
BEGIN
  SELECT COALESCE(jsonb_object_agg(sub.src, sub.c), '{}'::jsonb)
  INTO v_src
  FROM (
    SELECT COALESCE(l.source, 'unknown') AS src, COUNT(*)::int AS c
    FROM public.leads l
    WHERE l.created_at >= p_start AND l.created_at <= p_end
    GROUP BY l.source
  ) sub;

  SELECT COALESCE(jsonb_object_agg(sub.st, sub.c), '{}'::jsonb)
  INTO v_st
  FROM (
    SELECT COALESCE(l.status, 'unknown') AS st, COUNT(*)::int AS c
    FROM public.leads l
    WHERE l.created_at >= p_start AND l.created_at <= p_end
    GROUP BY l.status
  ) sub;

  SELECT COUNT(*)::int
  INTO v_total
  FROM public.leads l
  WHERE l.created_at >= p_start AND l.created_at <= p_end;

  SELECT COUNT(*)::int
  INTO v_conv
  FROM public.leads l
  WHERE l.created_at >= p_start AND l.created_at <= p_end
    AND l.status = ANY(converted_arr);

  v_rate := CASE
    WHEN v_total > 0 THEN round((v_conv::numeric / v_total * 100)::numeric, 2)
    ELSE 0
  END;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'user_id', r.assigned_to,
        'user_name', COALESCE(u.name, 'Unknown'),
        'total_leads', r.total,
        'converted_leads', r.conv,
        'conversion_rate', CASE
          WHEN r.total > 0 THEN round((r.conv::numeric / r.total * 100)::numeric, 2)
          ELSE 0
        END
      )
      ORDER BY u.name NULLS LAST
    ),
    '[]'::jsonb
  )
  INTO v_rep
  FROM (
    SELECT l.assigned_to,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE l.status = ANY(converted_arr))::int AS conv
    FROM public.leads l
    WHERE l.created_at >= p_start AND l.created_at <= p_end
      AND l.assigned_to IS NOT NULL
    GROUP BY l.assigned_to
  ) r
  LEFT JOIN public.users u ON u.id = r.assigned_to;

  SELECT
    CASE
      WHEN COUNT(*) > 0 THEN round(
        (COUNT(*) FILTER (WHERE f.status = 'done')::numeric / COUNT(*)::numeric * 100)::numeric,
        2
      )
      ELSE 0
    END
  INTO v_fu
  FROM public.follow_ups f
  WHERE f.scheduled_at >= p_start AND f.scheduled_at <= p_end;

  SELECT COUNT(*)::int
  INTO v_sla
  FROM public.leads l
  WHERE l.created_at >= p_start AND l.created_at <= p_end
    AND l.status = 'new'
    AND (
      l.first_contact_at IS NULL
      OR EXTRACT(EPOCH FROM (l.first_contact_at - l.created_at)) / 60.0 > 5
    );

  WITH series AS (
    SELECT gs::date AS d
    FROM generate_series(p_start::date, p_end::date, interval '1 day') AS gs
  ),
  daily AS (
    SELECT (l.created_at AT TIME ZONE 'UTC')::date AS d,
      COUNT(*)::int AS leads,
      COUNT(*) FILTER (WHERE l.status = ANY(converted_arr))::int AS converted
    FROM public.leads l
    WHERE l.created_at >= p_start AND l.created_at <= p_end
    GROUP BY 1
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'date', s.d::text,
        'leads', COALESCE(d.leads, 0),
        'converted', COALESCE(d.converted, 0)
      )
      ORDER BY s.d
    ),
    '[]'::jsonb
  )
  INTO v_time
  FROM series s
  LEFT JOIN daily d ON d.d = s.d;

  WITH prod AS (
    SELECT p.id, p.title, lower(trim(p.title)) AS t
    FROM public.products p
    WHERE p.is_active = true
      AND p.title IS NOT NULL
      AND btrim(p.title) <> ''
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'product_name', x.title,
        'product_id', x.id,
        'leads_count', x.cnt
      )
      ORDER BY x.cnt DESC
    ),
    '[]'::jsonb
  )
  INTO v_int
  FROM (
    SELECT pr.id, pr.title, COUNT(*)::int AS cnt
    FROM prod pr
    INNER JOIN public.leads l ON l.requirement IS NOT NULL
      AND lower(l.requirement) LIKE '%' || pr.t || '%'
      AND l.created_at >= p_start
      AND l.created_at <= p_end
    GROUP BY pr.id, pr.title
    HAVING COUNT(*) > 0
  ) x;

  WITH prod AS (
    SELECT p.id, p.title, lower(trim(p.title)) AS t
    FROM public.products p
    WHERE p.is_active = true
      AND p.title IS NOT NULL
      AND btrim(p.title) <> ''
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'product_name', x.title,
        'product_id', x.id,
        'leads_count', x.cnt
      )
      ORDER BY x.cnt DESC
    ),
    '[]'::jsonb
  )
  INTO v_cprod
  FROM (
    SELECT pr.id, pr.title, COUNT(*)::int AS cnt
    FROM prod pr
    INNER JOIN public.leads l ON l.requirement IS NOT NULL
      AND lower(l.requirement) LIKE '%' || pr.t || '%'
      AND l.created_at >= p_start
      AND l.created_at <= p_end
      AND l.status = ANY(converted_arr)
    GROUP BY pr.id, pr.title
    HAVING COUNT(*) > 0
  ) x;

  RETURN jsonb_build_object(
    'leadsBySource', v_src,
    'leadsByStatus', v_st,
    'conversionRate', v_rate,
    'repPerformance', v_rep,
    'followUpCompliance', LEAST(100::numeric, GREATEST(0::numeric, v_fu)),
    'slaBreaches', v_sla,
    'leadsOverTime', v_time,
    'leadsInterestedByProduct', v_int,
    'convertedLeadsByProduct', v_cprod
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_lead_counts_by_status(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_analytics_dashboard(timestamptz, timestamptz) TO service_role;
