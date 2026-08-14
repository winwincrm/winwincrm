-- Drop outbound Madara push infrastructure
DROP TABLE IF EXISTS public.madara_push_log CASCADE;
DROP TABLE IF EXISTS public.office_madara_credentials CASCADE;

DROP FUNCTION IF EXISTS public.claim_lead_for_madara_push(uuid, int);
DROP FUNCTION IF EXISTS public.release_madara_push_claim(uuid);

ALTER TABLE public.leads
  DROP COLUMN IF EXISTS madara_pushed_at,
  DROP COLUMN IF EXISTS madara_remote_id,
  DROP COLUMN IF EXISTS madara_last_error;

DELETE FROM public.app_settings WHERE key = 'madara_push_paused';