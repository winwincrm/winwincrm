DROP POLICY IF EXISTS "Agent updates assigned leads" ON public.leads;
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
    AND (
      -- default: agents can only keep the lead assigned to themselves
      assigned_user_id = auth.uid()
      -- exception: Alex Cliff may hand his leads off to Byraza
      OR (
        auth.uid() = '9e0a659f-d2dd-4901-ac88-079d6de6461c'::uuid
        AND assigned_user_id = 'c03ac0e8-7cbc-4d5b-898a-562b4919e97b'::uuid
      )
    )
  );