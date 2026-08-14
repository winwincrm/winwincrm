UPDATE public.leads
SET assigned_user_id = '02551632-aac4-4663-bae6-fcc94ad34629'
WHERE assigned_user_id IS NULL
  AND office_id = '4cb70020-cabf-4ab6-bc06-58f55e7e0220'
  AND updated_at > now() - interval '24 hours';