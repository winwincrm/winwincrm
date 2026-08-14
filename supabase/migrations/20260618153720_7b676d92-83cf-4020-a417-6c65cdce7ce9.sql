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
    ORDER BY l.created_at DESC, l.id DESC
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
    ORDER BY l.created_at DESC, l.id DESC
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
    ORDER BY l.assigned_at DESC NULLS LAST, l.created_at DESC, l.id DESC
    OFFSET v_offset
    LIMIT v_limit;
    RETURN;
  END IF;

  RETURN;
END;
$function$;

REVOKE ALL ON FUNCTION public.leads_page(uuid, uuid, boolean, text, text, text, text, date, date, text, text, text, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.leads_page(uuid, uuid, boolean, text, text, text, text, date, date, text, text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leads_page(uuid, uuid, boolean, text, text, text, text, date, date, text, text, text, integer, integer) TO authenticated, service_role;