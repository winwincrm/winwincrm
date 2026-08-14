REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.profiles_guard_sensitive_columns() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.broadcast_lead_change() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM public;
REVOKE EXECUTE ON FUNCTION public.get_user_office(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.is_ip_allowed(text) FROM public;