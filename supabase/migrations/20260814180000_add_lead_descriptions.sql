BEGIN;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS description_1 text,
  ADD COLUMN IF NOT EXISTS description_2 text,
  ADD COLUMN IF NOT EXISTS description_3 text,
  ADD COLUMN IF NOT EXISTS description_4 text;

COMMENT ON COLUMN public.leads.description_1 IS 'First free-form lead description imported from CRM source data.';
COMMENT ON COLUMN public.leads.description_2 IS 'Second free-form lead description imported from CRM source data.';
COMMENT ON COLUMN public.leads.description_3 IS 'Third free-form lead description imported from CRM source data.';
COMMENT ON COLUMN public.leads.description_4 IS 'Fourth free-form lead description imported from CRM source data.';

-- Refresh PostgREST immediately so inserts no longer use a stale schema cache.
NOTIFY pgrst, 'reload schema';

COMMIT;
