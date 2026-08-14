CREATE OR REPLACE FUNCTION public.current_user_office_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT office_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_team_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT team_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

DROP POLICY IF EXISTS profiles_manager_office ON public.profiles;
DROP POLICY IF EXISTS profiles_supervisor_team ON public.profiles;

CREATE POLICY profiles_manager_office ON public.profiles FOR SELECT
USING (has_role(auth.uid(), 'manager'::app_role) AND office_id = public.current_user_office_id());

CREATE POLICY profiles_supervisor_team ON public.profiles FOR SELECT
USING (has_role(auth.uid(), 'supervisor'::app_role) AND team_id = public.current_user_team_id());