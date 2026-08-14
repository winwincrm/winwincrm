CREATE OR REPLACE FUNCTION public.is_ip_allowed(_ip text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT true;
$$;

GRANT EXECUTE ON FUNCTION public.is_ip_allowed(text) TO anon, authenticated, service_role;