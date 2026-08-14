CREATE OR REPLACE FUNCTION public.is_user_in_current_user_office(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles target_profile
    WHERE target_profile.user_id = _user_id
      AND target_profile.office_id = public.current_user_office_id()
      AND target_profile.status = 'active'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_user_in_current_user_office(uuid) TO authenticated;

DROP POLICY IF EXISTS user_roles_office_staff_read ON public.user_roles;
CREATE POLICY user_roles_office_staff_read
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  (
    public.has_role(auth.uid(), 'manager'::public.app_role)
    OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
  )
  AND public.is_user_in_current_user_office(user_id)
);

DROP POLICY IF EXISTS leads_supervisor_office_select ON public.leads;
CREATE POLICY leads_supervisor_office_select
ON public.leads
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'supervisor'::public.app_role)
  AND office_id = public.current_user_office_id()
);

DROP POLICY IF EXISTS leads_supervisor_office_update ON public.leads;
CREATE POLICY leads_supervisor_office_update
ON public.leads
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'supervisor'::public.app_role)
  AND office_id = public.current_user_office_id()
)
WITH CHECK (
  public.has_role(auth.uid(), 'supervisor'::public.app_role)
  AND office_id = public.current_user_office_id()
  AND (
    assigned_user_id IS NULL
    OR public.is_user_in_current_user_office(assigned_user_id)
  )
);