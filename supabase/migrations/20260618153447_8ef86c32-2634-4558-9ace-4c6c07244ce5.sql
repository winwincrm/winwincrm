REVOKE ALL ON FUNCTION public.dashboard_stats(uuid, date, date) FROM anon;
REVOKE ALL ON FUNCTION public.leads_group_counts(uuid, uuid, boolean, text, text, text, text, date, date, text) FROM anon;
REVOKE ALL ON FUNCTION public.leads_page(uuid, uuid, boolean, text, text, text, text, date, date, text, text, text, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.dashboard_stats(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leads_group_counts(uuid, uuid, boolean, text, text, text, text, date, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leads_page(uuid, uuid, boolean, text, text, text, text, date, date, text, text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_stats(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.leads_group_counts(uuid, uuid, boolean, text, text, text, text, date, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.leads_page(uuid, uuid, boolean, text, text, text, text, date, date, text, text, text, integer, integer) TO authenticated, service_role;