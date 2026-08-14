REVOKE EXECUTE ON FUNCTION public.is_ip_allowed(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_office(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_ip_allowed(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_office(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;