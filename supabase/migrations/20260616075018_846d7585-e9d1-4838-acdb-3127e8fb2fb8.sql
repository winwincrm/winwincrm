
ALTER TABLE public.offices
  ADD COLUMN company_name TEXT,
  ADD COLUMN contact_email TEXT,
  ADD COLUMN contact_phone TEXT,
  ADD COLUMN status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.ip_whitelist RENAME COLUMN ip TO ip_address;
ALTER TABLE public.ip_whitelist ADD COLUMN status TEXT NOT NULL DEFAULT 'active';

CREATE OR REPLACE FUNCTION public.is_ip_allowed(_ip TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.ip_whitelist WHERE status = 'active')
      OR EXISTS (SELECT 1 FROM public.ip_whitelist WHERE ip_address = _ip AND status = 'active');
$$;
REVOKE EXECUTE ON FUNCTION public.is_ip_allowed(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_ip_allowed(TEXT) TO service_role;
