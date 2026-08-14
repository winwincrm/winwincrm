CREATE INDEX IF NOT EXISTS leads_agent_assigned_created_idx
  ON public.leads (assigned_user_id, assigned_at DESC NULLS LAST, created_at DESC);

CREATE INDEX IF NOT EXISTS leads_office_agent_created_idx
  ON public.leads (office_id, assigned_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS leads_office_status_created_idx
  ON public.leads (office_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS lead_comments_lead_created_idx
  ON public.lead_comments (lead_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.dashboard_stats(
  p_office uuid DEFAULT NULL::uuid,
  p_from date DEFAULT NULL::date,
  p_to date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_office uuid;
  v_is_admin boolean;
  v_is_manager boolean;
  v_is_supervisor boolean;
  v_is_agent boolean;
  v_scope_office uuid;
  v_scope_agent uuid;
  v_allow_all boolean := false;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'total', 0, 'today', 0, 'unassigned', 0, 'followups', 0,
      'by_status', '{}'::jsonb, 'by_agent', '[]'::jsonb, 'by_office', '[]'::jsonb,
      'office_by_status', '[]'::jsonb, 'agent_status', '[]'::jsonb
    );
  END IF;

  SELECT pr.office_id INTO v_office
  FROM public.profiles pr
  WHERE pr.user_id = v_uid
    AND pr.status = 'active'
  LIMIT 1;

  SELECT
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid AND ur.role = 'admin'::public.app_role),
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid AND ur.role = 'manager'::public.app_role),
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid AND ur.role = 'supervisor'::public.app_role),
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid AND ur.role = 'agent'::public.app_role)
  INTO v_is_admin, v_is_manager, v_is_supervisor, v_is_agent;

  IF v_is_admin THEN
    v_allow_all := p_office IS NULL;
    v_scope_office := p_office;
  ELSIF (v_is_manager OR v_is_supervisor) AND v_office IS NOT NULL THEN
    v_scope_office := v_office;
  ELSIF v_is_agent THEN
    v_scope_agent := v_uid;
  ELSE
    RETURN jsonb_build_object(
      'total', 0, 'today', 0, 'unassigned', 0, 'followups', 0,
      'by_status', '{}'::jsonb, 'by_agent', '[]'::jsonb, 'by_office', '[]'::jsonb,
      'office_by_status', '[]'::jsonb, 'agent_status', '[]'::jsonb
    );
  END IF;

  WITH scoped AS (
    SELECT id, status::text AS status, office_id, assigned_user_id, platform, created_at
    FROM public.leads l
    WHERE (v_allow_all OR v_scope_office IS NULL OR l.office_id = v_scope_office)
      AND (v_scope_agent IS NULL OR l.assigned_user_id = v_scope_agent)
      AND (p_from IS NULL OR l.created_at >= p_from::timestamptz)
      AND (p_to IS NULL OR l.created_at < (p_to + 1)::timestamptz)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM scoped),
    'today', (SELECT count(*) FROM scoped WHERE created_at >= date_trunc('day', now())),
    'unassigned', (SELECT count(*) FROM scoped WHERE assigned_user_id IS NULL),
    'followups', (SELECT count(*) FROM scoped WHERE status = 'callback'),
    'by_status', COALESCE((SELECT jsonb_object_agg(status, c) FROM (
      SELECT status, count(*) AS c FROM scoped GROUP BY status
    ) s), '{}'::jsonb),
    'by_agent', COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id', assigned_user_id, 'count', c) ORDER BY c DESC) FROM (
      SELECT assigned_user_id, count(*) AS c
      FROM scoped
      WHERE assigned_user_id IS NOT NULL
      GROUP BY assigned_user_id
    ) a), '[]'::jsonb),
    'by_office', COALESCE((SELECT jsonb_agg(jsonb_build_object('office_id', office_id, 'count', c, 'unassigned', un, 'cold', cd)) FROM (
      SELECT office_id,
             count(*) AS c,
             count(*) FILTER (WHERE assigned_user_id IS NULL) AS un,
             count(*) FILTER (WHERE platform IS NULL OR platform = 'unknown') AS cd
      FROM scoped
      WHERE office_id IS NOT NULL
      GROUP BY office_id
    ) o), '[]'::jsonb),
    'office_by_status', COALESCE((SELECT jsonb_agg(jsonb_build_object('office_id', office_id, 'status', status, 'count', c)) FROM (
      SELECT office_id, status, count(*) AS c
      FROM scoped
      WHERE office_id IS NOT NULL
      GROUP BY office_id, status
    ) os), '[]'::jsonb),
    'agent_status', COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id', assigned_user_id, 'status', status, 'count', c)) FROM (
      SELECT assigned_user_id, status, count(*) AS c
      FROM scoped
      WHERE assigned_user_id IS NOT NULL
      GROUP BY assigned_user_id, status
    ) m), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.leads_group_counts(
  p_office uuid DEFAULT NULL::uuid,
  p_agent uuid DEFAULT NULL::uuid,
  p_unassigned boolean DEFAULT NULL::boolean,
  p_platform text DEFAULT NULL::text,
  p_source text DEFAULT NULL::text,
  p_country text DEFAULT NULL::text,
  p_q text DEFAULT NULL::text,
  p_from date DEFAULT NULL::date,
  p_to date DEFAULT NULL::date,
  p_src text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_office uuid;
  v_is_admin boolean;
  v_is_manager boolean;
  v_is_supervisor boolean;
  v_is_agent boolean;
  v_scope_office uuid;
  v_scope_agent uuid;
  v_allow_all boolean := false;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('total', 0, 'by_status', '{}'::jsonb);
  END IF;

  SELECT pr.office_id INTO v_office
  FROM public.profiles pr
  WHERE pr.user_id = v_uid
    AND pr.status = 'active'
  LIMIT 1;

  SELECT
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid AND ur.role = 'admin'::public.app_role),
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid AND ur.role = 'manager'::public.app_role),
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid AND ur.role = 'supervisor'::public.app_role),
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid AND ur.role = 'agent'::public.app_role)
  INTO v_is_admin, v_is_manager, v_is_supervisor, v_is_agent;

  IF v_is_admin THEN
    v_allow_all := p_office IS NULL;
    v_scope_office := p_office;
  ELSIF (v_is_manager OR v_is_supervisor) AND v_office IS NOT NULL THEN
    v_scope_office := v_office;
  ELSIF v_is_agent THEN
    v_scope_agent := v_uid;
  ELSE
    RETURN jsonb_build_object('total', 0, 'by_status', '{}'::jsonb);
  END IF;

  WITH scoped AS (
    SELECT l.status::text AS status
    FROM public.leads l
    WHERE (v_allow_all OR v_scope_office IS NULL OR l.office_id = v_scope_office)
      AND (v_scope_agent IS NULL OR l.assigned_user_id = v_scope_agent)
      AND (p_agent IS NULL OR l.assigned_user_id = p_agent)
      AND (p_unassigned IS NULL OR (p_unassigned = (l.assigned_user_id IS NULL)))
      AND (p_platform IS NULL OR lower(l.platform) = lower(p_platform))
      AND (p_source IS NULL OR lower(l.source) = lower(p_source))
      AND (p_country IS NULL OR lower((l.payload->>'country')) = lower(p_country))
      AND (p_from IS NULL OR l.created_at >= p_from::timestamptz)
      AND (p_to IS NULL OR l.created_at < (p_to + 1)::timestamptz)
      AND (p_q IS NULL OR (
           l.full_name ILIKE '%' || p_q || '%'
        OR l.email ILIKE '%' || p_q || '%'
        OR l.phone ILIKE '%' || p_q || '%'
        OR l.platform ILIKE '%' || p_q || '%'
      ))
      AND (p_src IS NULL OR (
           (p_src = 'crm' AND l.lead_kind = 'live' AND COALESCE(l.is_in_house,false) = false)
        OR (p_src = 'in_house' AND l.lead_kind = 'live' AND COALESCE(l.is_in_house,false) = true)
        OR (p_src = 'cold' AND (l.lead_kind = 'cold' OR l.lead_kind IS NULL))
      ))
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM scoped),
    'by_status', COALESCE((SELECT jsonb_object_agg(status, c) FROM (
      SELECT status, count(*) AS c FROM scoped GROUP BY status
    ) s), '{}'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.leads_page(
  p_office uuid DEFAULT NULL::uuid,
  p_agent uuid DEFAULT NULL::uuid,
  p_unassigned boolean DEFAULT NULL::boolean,
  p_platform text DEFAULT NULL::text,
  p_source text DEFAULT NULL::text,
  p_country text DEFAULT NULL::text,
  p_q text DEFAULT NULL::text,
  p_from date DEFAULT NULL::date,
  p_to date DEFAULT NULL::date,
  p_src text DEFAULT NULL::text,
  p_group text DEFAULT NULL::text,
  p_status text DEFAULT NULL::text,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 1000
)
RETURNS TABLE(
  id uuid,
  full_name text,
  first_name text,
  last_name text,
  phone text,
  email text,
  status public.lead_status,
  office_id uuid,
  assigned_user_id uuid,
  source text,
  platform text,
  amount numeric,
  percentage numeric,
  timeframe text,
  payload jsonb,
  last_contacted_at timestamp with time zone,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  assigned_at timestamp with time zone,
  lead_kind text,
  is_in_house boolean,
  hide_in_house_from_agents boolean,
  origin_agent_id uuid,
  origin_agent_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_office uuid;
  v_is_admin boolean;
  v_is_manager boolean;
  v_is_supervisor boolean;
  v_is_agent boolean;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 1000);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  SELECT pr.office_id INTO v_office
  FROM public.profiles pr
  WHERE pr.user_id = v_uid
    AND pr.status = 'active'
  LIMIT 1;

  SELECT
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid AND ur.role = 'admin'::public.app_role),
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid AND ur.role = 'manager'::public.app_role),
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid AND ur.role = 'supervisor'::public.app_role),
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid AND ur.role = 'agent'::public.app_role)
  INTO v_is_admin, v_is_manager, v_is_supervisor, v_is_agent;

  IF v_is_admin THEN
    RETURN QUERY
    SELECT
      l.id, l.full_name, l.first_name, l.last_name, l.phone, l.email, l.status,
      l.office_id, l.assigned_user_id, l.source, l.platform, l.amount, l.percentage,
      l.timeframe, l.payload, l.last_contacted_at, l.created_at, l.updated_at,
      l.assigned_at, l.lead_kind::text, l.is_in_house, l.hide_in_house_from_agents,
      l.origin_agent_id, l.origin_agent_name
    FROM public.leads l
    WHERE (p_office IS NULL OR l.office_id = p_office)
      AND (p_agent IS NULL OR l.assigned_user_id = p_agent)
      AND (p_unassigned IS NULL OR (p_unassigned = (l.assigned_user_id IS NULL)))
      AND (p_platform IS NULL OR lower(l.platform) = lower(p_platform))
      AND (p_source IS NULL OR lower(l.source) = lower(p_source))
      AND (p_country IS NULL OR lower((l.payload->>'country')) = lower(p_country))
      AND (p_from IS NULL OR l.created_at >= p_from::timestamptz)
      AND (p_to IS NULL OR l.created_at < (p_to + 1)::timestamptz)
      AND (p_q IS NULL OR (l.full_name ILIKE '%' || p_q || '%' OR l.email ILIKE '%' || p_q || '%' OR l.phone ILIKE '%' || p_q || '%' OR l.platform ILIKE '%' || p_q || '%'))
      AND (p_src IS NULL OR ((p_src = 'crm' AND l.lead_kind = 'live' AND COALESCE(l.is_in_house,false) = false) OR (p_src = 'in_house' AND l.lead_kind = 'live' AND COALESCE(l.is_in_house,false) = true) OR (p_src = 'cold' AND (l.lead_kind = 'cold' OR l.lead_kind IS NULL))))
      AND (p_status IS NULL OR l.status::text = p_status)
      AND (p_group IS NULL OR p_group = 'all' OR ((p_group = 'new' AND l.status::text IN ('new')) OR (p_group = 'in_progress' AND l.status::text IN ('no_answer_1','no_answer_2','no_answer_3','wrong_number','try_again','not_interested')) OR (p_group = 'callback' AND l.status::text IN ('callback')) OR (p_group = 'appointment' AND l.status::text IN ('appointment')) OR (p_group = 'converted' AND l.status::text IN ('converted')) OR (p_group = 'bad' AND l.status::text IN ('bad_quality','rejected'))))
    ORDER BY l.created_at DESC
    OFFSET v_offset
    LIMIT v_limit;
    RETURN;
  END IF;

  IF (v_is_manager OR v_is_supervisor) AND v_office IS NOT NULL THEN
    RETURN QUERY
    SELECT
      l.id, l.full_name, l.first_name, l.last_name, l.phone, l.email, l.status,
      l.office_id, l.assigned_user_id, l.source, l.platform, l.amount, l.percentage,
      l.timeframe, l.payload, l.last_contacted_at, l.created_at, l.updated_at,
      l.assigned_at, l.lead_kind::text, l.is_in_house, l.hide_in_house_from_agents,
      l.origin_agent_id, l.origin_agent_name
    FROM public.leads l
    WHERE l.office_id = v_office
      AND (p_agent IS NULL OR l.assigned_user_id = p_agent)
      AND (p_unassigned IS NULL OR (p_unassigned = (l.assigned_user_id IS NULL)))
      AND (p_platform IS NULL OR lower(l.platform) = lower(p_platform))
      AND (p_source IS NULL OR lower(l.source) = lower(p_source))
      AND (p_country IS NULL OR lower((l.payload->>'country')) = lower(p_country))
      AND (p_from IS NULL OR l.created_at >= p_from::timestamptz)
      AND (p_to IS NULL OR l.created_at < (p_to + 1)::timestamptz)
      AND (p_q IS NULL OR (l.full_name ILIKE '%' || p_q || '%' OR l.email ILIKE '%' || p_q || '%' OR l.phone ILIKE '%' || p_q || '%' OR l.platform ILIKE '%' || p_q || '%'))
      AND (p_src IS NULL OR ((p_src = 'crm' AND l.lead_kind = 'live' AND COALESCE(l.is_in_house,false) = false) OR (p_src = 'in_house' AND l.lead_kind = 'live' AND COALESCE(l.is_in_house,false) = true) OR (p_src = 'cold' AND (l.lead_kind = 'cold' OR l.lead_kind IS NULL))))
      AND (p_status IS NULL OR l.status::text = p_status)
      AND (p_group IS NULL OR p_group = 'all' OR ((p_group = 'new' AND l.status::text IN ('new')) OR (p_group = 'in_progress' AND l.status::text IN ('no_answer_1','no_answer_2','no_answer_3','wrong_number','try_again','not_interested')) OR (p_group = 'callback' AND l.status::text IN ('callback')) OR (p_group = 'appointment' AND l.status::text IN ('appointment')) OR (p_group = 'converted' AND l.status::text IN ('converted')) OR (p_group = 'bad' AND l.status::text IN ('bad_quality','rejected'))))
    ORDER BY l.created_at DESC
    OFFSET v_offset
    LIMIT v_limit;
    RETURN;
  END IF;

  IF v_is_agent THEN
    RETURN QUERY
    SELECT
      l.id, l.full_name, l.first_name, l.last_name, l.phone, l.email, l.status,
      l.office_id, l.assigned_user_id, l.source, l.platform, l.amount, l.percentage,
      l.timeframe, l.payload, l.last_contacted_at, l.created_at, l.updated_at,
      l.assigned_at, l.lead_kind::text, l.is_in_house, l.hide_in_house_from_agents,
      l.origin_agent_id, l.origin_agent_name
    FROM public.leads l
    WHERE l.assigned_user_id = v_uid
      AND (p_agent IS NULL OR l.assigned_user_id = p_agent)
      AND (p_unassigned IS NULL OR (p_unassigned = (l.assigned_user_id IS NULL)))
      AND (p_platform IS NULL OR lower(l.platform) = lower(p_platform))
      AND (p_source IS NULL OR lower(l.source) = lower(p_source))
      AND (p_country IS NULL OR lower((l.payload->>'country')) = lower(p_country))
      AND (p_from IS NULL OR l.created_at >= p_from::timestamptz)
      AND (p_to IS NULL OR l.created_at < (p_to + 1)::timestamptz)
      AND (p_q IS NULL OR (l.full_name ILIKE '%' || p_q || '%' OR l.email ILIKE '%' || p_q || '%' OR l.phone ILIKE '%' || p_q || '%' OR l.platform ILIKE '%' || p_q || '%'))
      AND (p_src IS NULL OR ((p_src = 'crm' AND l.lead_kind = 'live' AND COALESCE(l.is_in_house,false) = false) OR (p_src = 'in_house' AND l.lead_kind = 'live' AND COALESCE(l.is_in_house,false) = true) OR (p_src = 'cold' AND (l.lead_kind = 'cold' OR l.lead_kind IS NULL))))
      AND (p_status IS NULL OR l.status::text = p_status)
      AND (p_group IS NULL OR p_group = 'all' OR ((p_group = 'new' AND l.status::text IN ('new')) OR (p_group = 'in_progress' AND l.status::text IN ('no_answer_1','no_answer_2','no_answer_3','wrong_number','try_again','not_interested')) OR (p_group = 'callback' AND l.status::text IN ('callback')) OR (p_group = 'appointment' AND l.status::text IN ('appointment')) OR (p_group = 'converted' AND l.status::text IN ('converted')) OR (p_group = 'bad' AND l.status::text IN ('bad_quality','rejected'))))
    ORDER BY l.assigned_at DESC NULLS LAST, l.created_at DESC
    OFFSET v_offset
    LIMIT v_limit;
    RETURN;
  END IF;

  RETURN;
END;
$function$;

REVOKE ALL ON FUNCTION public.dashboard_stats(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leads_group_counts(uuid, uuid, boolean, text, text, text, text, date, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leads_page(uuid, uuid, boolean, text, text, text, text, date, date, text, text, text, integer, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.dashboard_stats(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.leads_group_counts(uuid, uuid, boolean, text, text, text, text, date, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.leads_page(uuid, uuid, boolean, text, text, text, text, date, date, text, text, text, integer, integer) TO authenticated, service_role;