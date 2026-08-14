-- role_permissions: admin-controlled visibility per role
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role app_role PRIMARY KEY,
  lead_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  nav_items   jsonb NOT NULL DEFAULT '{}'::jsonb,
  actions     jsonb NOT NULL DEFAULT '{}'::jsonb,
  dashboard   jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid
);

GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL    ON public.role_permissions TO service_role;

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "role_perms_read_authenticated" ON public.role_permissions;
CREATE POLICY "role_perms_read_authenticated" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "role_perms_admin_write" ON public.role_permissions;
CREATE POLICY "role_perms_admin_write" ON public.role_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Server-side gate for privileged actions.
CREATE OR REPLACE FUNCTION public.require_action_permission(_action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r app_role;
  allowed boolean;
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN RETURN; END IF;
  SELECT role INTO r FROM public.user_roles WHERE user_id = auth.uid()
    ORDER BY CASE role
      WHEN 'superiormanager' THEN 1
      WHEN 'manager' THEN 2
      WHEN 'agent' THEN 3
      ELSE 4 END
    LIMIT 1;
  IF r IS NULL THEN RAISE EXCEPTION 'permission_denied: no role'; END IF;
  SELECT COALESCE((actions -> _action)::boolean, true) INTO allowed
    FROM public.role_permissions WHERE role = r;
  IF NOT COALESCE(allowed, true) THEN
    RAISE EXCEPTION 'permission_denied: action % not allowed for %', _action, r;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.require_action_permission(text) TO authenticated;

-- Seed defaults (only insert if missing)
INSERT INTO public.role_permissions (role, lead_fields, nav_items, actions, dashboard) VALUES
('agent',
  jsonb_build_object(
    'email',true,'phone',true,'source',true,'platform',true,'country',true,
    'amount_lost',true,'comment',true,
    'description_1',true,'description_2',true,'description_3',true,'description_4',true,
    'office',false,'assigned_agent',false,'imported',true,'last_activity',true
  ),
  jsonb_build_object(
    'dashboard',true,'leads',true,'calendar',true,'offices',false,'my_office',false,
    'my_team',false,'users',false,'api_keys',false,'affiliates',false,'sources',false,
    'api_logs',false,'settings',true,'admin',false
  ),
  jsonb_build_object(
    'export_csv',false,'import_leads',false,'add_lead',false,
    'delete_lead',false,'bulk_reassign',false,'reassign',false,
    'call',true,'edit_status',true,'edit_descriptions',true,'edit_comment',true
  ),
  jsonb_build_object(
    'total_leads',true,'leads_today',true,'my_followups',true,'new_assigned',true,
    'by_status',true,'by_agent',false,'by_office',false,'agent_matrix',false,'recent_activity',false
  )
),
('manager',
  jsonb_build_object(
    'email',true,'phone',true,'source',true,'platform',true,'country',true,
    'amount_lost',true,'comment',true,
    'description_1',true,'description_2',true,'description_3',true,'description_4',true,
    'office',true,'assigned_agent',true,'imported',true,'last_activity',true
  ),
  jsonb_build_object(
    'dashboard',true,'leads',true,'calendar',true,'offices',false,'my_office',true,
    'my_team',true,'users',true,'api_keys',false,'affiliates',false,'sources',false,
    'api_logs',false,'settings',true,'admin',false
  ),
  jsonb_build_object(
    'export_csv',true,'import_leads',true,'add_lead',true,
    'delete_lead',false,'bulk_reassign',true,'reassign',true,
    'call',true,'edit_status',true,'edit_descriptions',true,'edit_comment',true
  ),
  jsonb_build_object(
    'total_leads',true,'leads_today',true,'my_followups',true,'new_assigned',true,
    'by_status',true,'by_agent',true,'by_office',false,'agent_matrix',true,'recent_activity',true
  )
),
('superiormanager',
  jsonb_build_object(
    'email',true,'phone',true,'source',true,'platform',true,'country',true,
    'amount_lost',true,'comment',true,
    'description_1',true,'description_2',true,'description_3',true,'description_4',true,
    'office',true,'assigned_agent',true,'imported',true,'last_activity',true
  ),
  jsonb_build_object(
    'dashboard',true,'leads',true,'calendar',true,'offices',false,'my_office',true,
    'my_team',true,'users',true,'api_keys',false,'affiliates',false,'sources',false,
    'api_logs',false,'settings',true,'admin',false
  ),
  jsonb_build_object(
    'export_csv',true,'import_leads',true,'add_lead',true,
    'delete_lead',true,'bulk_reassign',true,'reassign',true,
    'call',true,'edit_status',true,'edit_descriptions',true,'edit_comment',true
  ),
  jsonb_build_object(
    'total_leads',true,'leads_today',true,'my_followups',true,'new_assigned',true,
    'by_status',true,'by_agent',true,'by_office',true,'agent_matrix',true,'recent_activity',true
  )
)
ON CONFLICT (role) DO NOTHING;
