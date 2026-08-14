CREATE OR REPLACE FUNCTION public.is_ip_allowed(_ip text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN NOT EXISTS (SELECT 1 FROM public.ip_whitelist WHERE status = 'active') THEN true
      ELSE EXISTS (SELECT 1 FROM public.ip_whitelist WHERE status = 'active' AND ip_address = _ip)
    END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_ip_allowed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_ip_allowed(text) TO anon, authenticated;