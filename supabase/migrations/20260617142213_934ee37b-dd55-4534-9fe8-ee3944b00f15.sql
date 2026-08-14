CREATE POLICY leads_supervisor_office_insert
ON public.leads
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'supervisor'::public.app_role)
  AND office_id = public.current_user_office_id()
);