GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.current_user_office_id() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.current_user_team_id() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_user_in_current_user_team(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_ip_allowed(text) TO authenticated, anon;