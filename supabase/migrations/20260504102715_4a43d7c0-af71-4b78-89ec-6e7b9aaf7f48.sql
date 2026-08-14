CREATE POLICY "Agent updates office leads"
ON public.leads
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'agent'::app_role)
  AND office_id = get_user_office(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'agent'::app_role)
  AND office_id = get_user_office(auth.uid())
);

CREATE POLICY "Agent reads office leads"
ON public.leads
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'agent'::app_role)
  AND office_id = get_user_office(auth.uid())
);