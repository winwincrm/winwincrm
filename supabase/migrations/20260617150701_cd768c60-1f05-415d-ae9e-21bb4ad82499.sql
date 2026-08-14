CREATE POLICY "leads_supervisor_own_assigned_select"
ON public.leads
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'supervisor'::public.app_role)
  AND assigned_user_id = auth.uid()
);