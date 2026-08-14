
-- Indexes
CREATE INDEX IF NOT EXISTS leads_office_created_idx ON public.leads (office_id, created_at DESC);
CREATE INDEX IF NOT EXISTS leads_office_status_idx  ON public.leads (office_id, status);
CREATE INDEX IF NOT EXISTS leads_office_agent_idx   ON public.leads (office_id, assigned_user_id);
CREATE INDEX IF NOT EXISTS leads_office_platform_idx ON public.leads (office_id, platform);
CREATE INDEX IF NOT EXISTS leads_assigned_idx       ON public.leads (assigned_user_id);
CREATE INDEX IF NOT EXISTS leads_created_idx        ON public.leads (created_at DESC);

-- Dashboard stats: one call returns everything the dashboard needs.
-- SECURITY INVOKER so RLS on leads applies normally (admin sees all, manager/supervisor
-- only their office, agent only their assigned leads).
CREATE OR REPLACE FUNCTION public.dashboard_stats(
  p_office uuid DEFAULT NULL,
  p_from   date DEFAULT NULL,
  p_to     date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT id, status::text AS status, office_id, assigned_user_id, platform, created_at
    FROM public.leads
    WHERE (p_office IS NULL OR office_id = p_office)
      AND (p_from   IS NULL OR created_at >= p_from::timestamptz)
      AND (p_to     IS NULL OR created_at <  (p_to + 1)::timestamptz)
  )
  SELECT jsonb_build_object(
    'total',      (SELECT count(*) FROM scoped),
    'today',      (SELECT count(*) FROM scoped WHERE created_at >= date_trunc('day', now())),
    'unassigned', (SELECT count(*) FROM scoped WHERE assigned_user_id IS NULL),
    'followups',  (SELECT count(*) FROM scoped WHERE status = 'callback'),
    'by_status',  COALESCE((SELECT jsonb_object_agg(status, c) FROM (
                    SELECT status, count(*) AS c FROM scoped GROUP BY status
                  ) s), '{}'::jsonb),
    'by_agent',   COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id', assigned_user_id, 'count', c) ORDER BY c DESC)
                  FROM (
                    SELECT assigned_user_id, count(*) AS c
                    FROM scoped WHERE assigned_user_id IS NOT NULL
                    GROUP BY assigned_user_id
                  ) a), '[]'::jsonb),
    'by_office',  COALESCE((SELECT jsonb_agg(jsonb_build_object(
                    'office_id', office_id, 'count', c, 'unassigned', un, 'cold', cd
                  ))
                  FROM (
                    SELECT office_id,
                           count(*) AS c,
                           count(*) FILTER (WHERE assigned_user_id IS NULL) AS un,
                           count(*) FILTER (WHERE platform IS NULL OR platform = 'unknown') AS cd
                    FROM scoped WHERE office_id IS NOT NULL
                    GROUP BY office_id
                  ) o), '[]'::jsonb),
    'office_by_status', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                          'office_id', office_id, 'status', status, 'count', c
                        ))
                        FROM (
                          SELECT office_id, status, count(*) AS c
                          FROM scoped WHERE office_id IS NOT NULL
                          GROUP BY office_id, status
                        ) os), '[]'::jsonb),
    'agent_status', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                      'user_id', assigned_user_id, 'status', status, 'count', c
                    ))
                    FROM (
                      SELECT assigned_user_id, status, count(*) AS c
                      FROM scoped WHERE assigned_user_id IS NOT NULL
                      GROUP BY assigned_user_id, status
                    ) m), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_stats(uuid, date, date) TO authenticated, service_role;

-- Leads-page group counts (status-group strip)
CREATE OR REPLACE FUNCTION public.leads_group_counts(
  p_office     uuid DEFAULT NULL,
  p_agent      uuid DEFAULT NULL,
  p_unassigned boolean DEFAULT NULL,
  p_platform   text DEFAULT NULL,
  p_source     text DEFAULT NULL,
  p_country    text DEFAULT NULL,
  p_q          text DEFAULT NULL,
  p_from       date DEFAULT NULL,
  p_to         date DEFAULT NULL,
  p_src        text DEFAULT NULL  -- 'crm' | 'in_house' | 'cold' | null
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT status::text AS status
    FROM public.leads l
    WHERE (p_office     IS NULL OR l.office_id = p_office)
      AND (p_agent      IS NULL OR l.assigned_user_id = p_agent)
      AND (p_unassigned IS NULL OR (p_unassigned = (l.assigned_user_id IS NULL)))
      AND (p_platform   IS NULL OR lower(l.platform) = lower(p_platform))
      AND (p_source     IS NULL OR lower(l.source)   = lower(p_source))
      AND (p_country    IS NULL OR lower((l.payload->>'country')) = lower(p_country))
      AND (p_from       IS NULL OR l.created_at >= p_from::timestamptz)
      AND (p_to         IS NULL OR l.created_at <  (p_to + 1)::timestamptz)
      AND (p_q IS NULL OR (
           l.full_name  ILIKE '%' || p_q || '%'
        OR l.email      ILIKE '%' || p_q || '%'
        OR l.phone      ILIKE '%' || p_q || '%'
        OR l.platform   ILIKE '%' || p_q || '%'
      ))
      AND (p_src IS NULL OR (
           (p_src = 'crm'      AND l.lead_kind = 'live' AND COALESCE(l.is_in_house,false) = false)
        OR (p_src = 'in_house' AND l.lead_kind = 'live' AND COALESCE(l.is_in_house,false) = true)
        OR (p_src = 'cold'    AND (l.lead_kind = 'cold' OR l.lead_kind IS NULL))
      ))
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM scoped),
    'by_status', COALESCE((SELECT jsonb_object_agg(status, c) FROM (
                  SELECT status, count(*) AS c FROM scoped GROUP BY status
                ) s), '{}'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.leads_group_counts(uuid, uuid, boolean, text, text, text, text, date, date, text)
  TO authenticated, service_role;
