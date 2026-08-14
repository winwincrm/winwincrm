INSERT INTO public.ip_whitelist (ip_address, label, status)
SELECT '193.32.249.224', 'User IP', 'active'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.ip_whitelist
  WHERE ip_address = '193.32.249.224'
);

UPDATE public.ip_whitelist
SET status = 'active', label = COALESCE(label, 'User IP')
WHERE ip_address = '193.32.249.224';