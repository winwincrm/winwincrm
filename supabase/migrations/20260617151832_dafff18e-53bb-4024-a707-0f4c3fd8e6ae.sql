CREATE POLICY "profiles_supervisor_office_select"
ON public.profiles FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'supervisor'::public.app_role)
  AND office_id = public.current_user_office_id()
);