REVOKE EXECUTE ON FUNCTION public.claim_lead_for_madara_push(uuid, int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_madara_push_claim(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_lead_for_madara_push(uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_madara_push_claim(uuid) TO service_role;