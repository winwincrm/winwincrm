DROP POLICY IF EXISTS "Agent updates assigned leads" ON public.leads;
DROP POLICY IF EXISTS "Alex reassigns to Byraza" ON public.leads;

CREATE POLICY "Agent updates assigned leads"
ON public.leads
FOR UPDATE
USING (
  has_role(auth.uid(), 'agent'::app_role)
  AND assigned_user_id = auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'agent'::app_role)
  AND office_id = get_user_office(auth.uid())
  AND assigned_user_id = auth.uid()
);

CREATE POLICY "Alex reassigns to Byraza"
ON public.leads
FOR UPDATE
USING (
  auth.uid() = '9e0a659f-d2dd-4901-ac88-079d6de6461c'::uuid
  AND office_id = get_user_office(auth.uid())
)
WITH CHECK (
  auth.uid() = '9e0a659f-d2dd-4901-ac88-079d6de6461c'::uuid
  AND office_id = get_user_office(auth.uid())
  AND assigned_user_id IN (
    '9e0a659f-d2dd-4901-ac88-079d6de6461c'::uuid,
    'c03ac0e8-7cbc-4d5b-898a-562b4919e97b'::uuid
  )
);