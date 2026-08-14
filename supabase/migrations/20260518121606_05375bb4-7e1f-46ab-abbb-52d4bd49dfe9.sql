ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS phone_k9 text
  GENERATED ALWAYS AS (
    NULLIF(right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9), '')
  ) STORED;

CREATE INDEX IF NOT EXISTS leads_live_phone_k9_idx
  ON public.leads (phone_k9)
  WHERE lead_kind = 'live' AND phone_k9 IS NOT NULL;

CREATE INDEX IF NOT EXISTS leads_live_email_lower_idx
  ON public.leads (lower(email))
  WHERE lead_kind = 'live' AND email IS NOT NULL AND email <> '';