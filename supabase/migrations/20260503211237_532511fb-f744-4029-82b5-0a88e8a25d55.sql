-- Global app settings (admin-only)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin only app settings"
ON public.app_settings
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.app_settings (key, value)
VALUES ('madara_push_paused', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Atomic claim: returns true if this caller successfully claimed the lead for push.
-- Sets madara_pushed_at = now() only when previously NULL (or stale), preventing
-- two concurrent backfills from both pushing the same lead.
CREATE OR REPLACE FUNCTION public.claim_lead_for_madara_push(_lead_id uuid, _stale_seconds int DEFAULT 60)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count int;
BEGIN
  UPDATE public.leads
  SET madara_pushed_at = now()
  WHERE id = _lead_id
    AND (madara_pushed_at IS NULL
         OR madara_pushed_at < now() - make_interval(secs => _stale_seconds));
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$;

-- Release a claim if the push failed (so it can be retried)
CREATE OR REPLACE FUNCTION public.release_madara_push_claim(_lead_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.leads SET madara_pushed_at = NULL WHERE id = _lead_id;
$$;