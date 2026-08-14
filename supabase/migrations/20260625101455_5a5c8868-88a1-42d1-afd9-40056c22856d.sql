CREATE OR REPLACE FUNCTION public.leads_group_counts(p_office uuid[] DEFAULT NULL::uuid[], p_agent uuid[] DEFAULT NULL::uuid[], p_unassigned boolean DEFAULT NULL::boolean, p_platform text[] DEFAULT NULL::text[], p_source text[] DEFAULT NULL::text[], p_country text[] DEFAULT NULL::text[], p_q text DEFAULT NULL::text, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_src text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
  WHERE pr.user_id = v_uid AND pr.status = 'active'
  LIMIT 1;

  SELECT
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid AND ur.role = 'admin'::public.app_role),
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid AND ur.role = 'manager'::public.app_role),
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid AND ur.role = 'supervisor'::public.app_role),
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid AND ur.role = 'agent'::public.app_role)
  INTO v_is_admin, v_is_manager, v_is_supervisor, v_is_agent;

  IF v_is_admin THEN
    v_allow_all := (p_office IS NULL OR array_length(p_office,1) IS NULL);
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
    WHERE (
        v_allow_all
        OR v_scope_office IS NOT NULL
        OR v_scope_agent IS NOT NULL
        OR (p_office IS NOT NULL AND array_length(p_office,1) > 0)
      )
      AND (v_scope_office IS NULL OR l.office_id = v_scope_office)
      AND (NOT v_is_admin OR p_office IS NULL OR array_length(p_office,1) IS NULL OR l.office_id = ANY(p_office))
      AND (v_scope_agent IS NULL OR l.assigned_user_id = v_scope_agent)
      AND (
        (p_agent IS NULL OR array_length(p_agent,1) IS NULL) AND (p_unassigned IS NULL)
        OR (p_unassigned = true AND l.assigned_user_id IS NULL)
        OR (p_agent IS NOT NULL AND array_length(p_agent,1) > 0 AND l.assigned_user_id = ANY(p_agent))
      )
      AND (p_platform IS NULL OR array_length(p_platform,1) IS NULL OR lower(l.platform) = ANY(SELECT lower(x) FROM unnest(p_platform) AS x))
      AND (p_source IS NULL OR array_length(p_source,1) IS NULL OR lower(l.source) = ANY(SELECT lower(x) FROM unnest(p_source) AS x))
      AND (p_country IS NULL OR array_length(p_country,1) IS NULL OR lower(l.payload->>'country') = ANY(SELECT lower(x) FROM unnest(p_country) AS x))
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