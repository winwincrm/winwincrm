DROP POLICY IF EXISTS leads_supervisor_office_delete ON public.leads;
CREATE POLICY leads_supervisor_office_delete
ON public.leads
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'supervisor'::public.app_role)
  AND office_id = public.current_user_office_id()
);