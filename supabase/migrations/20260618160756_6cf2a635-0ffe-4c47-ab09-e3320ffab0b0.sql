CREATE OR REPLACE FUNCTION public.leads_filter_options()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_office uuid;
  v_is_admin boolean;
  v_is_manager boolean;
  v_is_supervisor boolean;
  v_is_agent boolean;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('countries','[]'::jsonb,'sources','[]'::jsonb,'platforms','[]'::jsonb);
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

  WITH scoped AS (
    SELECT l.source, l.platform, NULLIF(btrim(l.payload->>'country'),'') AS country
    FROM public.leads l
    WHERE
      (v_is_admin)
      OR ((v_is_manager OR v_is_supervisor) AND v_office IS NOT NULL AND l.office_id = v_office)
      OR (v_is_agent AND l.assigned_user_id = v_uid)
  )
  SELECT jsonb_build_object(
    'countries', COALESCE((SELECT jsonb_agg(c ORDER BY c) FROM (SELECT DISTINCT country AS c FROM scoped WHERE country IS NOT NULL) x), '[]'::jsonb),
    'sources',   COALESCE((SELECT jsonb_agg(s ORDER BY s) FROM (SELECT DISTINCT NULLIF(btrim(source),'') AS s FROM scoped) x WHERE s IS NOT NULL), '[]'::jsonb),
    'platforms', COALESCE((SELECT jsonb_agg(p ORDER BY p) FROM (SELECT DISTINCT NULLIF(btrim(platform),'') AS p FROM scoped) x WHERE p IS NOT NULL), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END $$;

GRANT EXECUTE ON FUNCTION public.leads_filter_options() TO authenticated;