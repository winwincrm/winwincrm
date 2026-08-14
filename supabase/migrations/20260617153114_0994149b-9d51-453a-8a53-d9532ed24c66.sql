REVOKE EXECUTE ON FUNCTION public.is_user_in_current_user_office(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_user_in_current_user_office(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_user_in_current_user_office(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_in_current_user_office(uuid) TO service_role;