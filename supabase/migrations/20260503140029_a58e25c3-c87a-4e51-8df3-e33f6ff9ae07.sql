GRANT EXECUTE ON FUNCTION public.get_user_office(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_ip_allowed(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated, service_role;