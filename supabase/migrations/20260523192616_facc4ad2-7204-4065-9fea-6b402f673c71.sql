DROP POLICY IF EXISTS "contact_requests office read" ON public.contact_requests;
DROP POLICY IF EXISTS "contact_requests office update" ON public.contact_requests;

CREATE POLICY "contact_requests ks office read"
ON public.contact_requests
FOR SELECT
USING (
  office_id = '4cb70020-cabf-4ab6-bc06-58f55e7e0220'::uuid
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.office_id = '4cb70020-cabf-4ab6-bc06-58f55e7e0220'::uuid
  )
);

CREATE POLICY "contact_requests ks office update"
ON public.contact_requests
FOR UPDATE
USING (
  office_id = '4cb70020-cabf-4ab6-bc06-58f55e7e0220'::uuid
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.office_id = '4cb70020-cabf-4ab6-bc06-58f55e7e0220'::uuid
  )
)
WITH CHECK (
  office_id = '4cb70020-cabf-4ab6-bc06-58f55e7e0220'::uuid
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.office_id = '4cb70020-cabf-4ab6-bc06-58f55e7e0220'::uuid
  )
);