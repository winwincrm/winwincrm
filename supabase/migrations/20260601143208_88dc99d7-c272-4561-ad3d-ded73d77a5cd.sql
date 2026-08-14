UPDATE public.affiliate_api_keys SET affiliate_id = (SELECT id FROM public.affiliates WHERE name='Cris') WHERE id = 'fd6604e6-9ec3-4987-b7af-87156336559f';

UPDATE public.leads
SET payload = payload
  || jsonb_build_object(
       'affiliate_id', (SELECT id::text FROM public.affiliates WHERE name='Cris'),
       'affiliate_name', 'Cris'
     )
WHERE source = 'affiliate'
  AND office_id IS NULL
  AND deleted_at IS NULL
  AND id IN ('00000000-0000-0000-0000-00000019e072','00000000-0000-0000-0000-00000019dd55');