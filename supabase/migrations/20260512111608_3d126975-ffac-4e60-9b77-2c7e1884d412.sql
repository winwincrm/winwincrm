-- Cleanup: trim and normalize casing on a known dup
UPDATE public.leads SET source = btrim(source) WHERE source IS NOT NULL AND source <> btrim(source);
UPDATE public.leads SET platform = btrim(platform) WHERE platform IS NOT NULL AND platform <> btrim(platform);
UPDATE public.leads SET source = 'google' WHERE source = 'Google';

-- Generated column: lead_kind
ALTER TABLE public.leads
  ADD COLUMN lead_kind text
  GENERATED ALWAYS AS (
    CASE
      WHEN btrim(coalesce(first_name, '')) <> ''
       AND btrim(coalesce(last_name,  '')) <> ''
      THEN 'crm'
      ELSE 'cold'
    END
  ) STORED;

CREATE INDEX IF NOT EXISTS leads_kind_idx ON public.leads (lead_kind);
CREATE INDEX IF NOT EXISTS leads_created_at_desc_idx ON public.leads (created_at DESC);