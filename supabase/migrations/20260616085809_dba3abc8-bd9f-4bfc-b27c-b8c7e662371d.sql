CREATE OR REPLACE FUNCTION public.is_user_in_current_user_team(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles target_profile
    JOIN public.profiles current_profile
      ON current_profile.team_id = target_profile.team_id
    WHERE current_profile.user_id = auth.uid()
      AND target_profile.user_id = _user_id
      AND current_profile.team_id IS NOT NULL
  );
$function$;

DROP POLICY IF EXISTS leads_manager_office ON public.leads;
DROP POLICY IF EXISTS leads_supervisor_team ON public.leads;
DROP POLICY IF EXISTS teams_manager_office ON public.teams;
DROP POLICY IF EXISTS teams_member_read ON public.teams;

CREATE POLICY leads_manager_office
ON public.leads
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  AND office_id = public.current_user_office_id()
)
WITH CHECK (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  AND office_id = public.current_user_office_id()
);

CREATE POLICY leads_supervisor_team
ON public.leads
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'supervisor'::public.app_role)
  AND public.is_user_in_current_user_team(assigned_user_id)
)
WITH CHECK (
  public.has_role(auth.uid(), 'supervisor'::public.app_role)
  AND public.is_user_in_current_user_team(assigned_user_id)
);

CREATE POLICY teams_manager_office
ON public.teams
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  AND office_id = public.current_user_office_id()
)
WITH CHECK (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  AND office_id = public.current_user_office_id()
);

CREATE POLICY teams_member_read
ON public.teams
FOR SELECT
TO authenticated
USING (id = public.current_user_team_id());