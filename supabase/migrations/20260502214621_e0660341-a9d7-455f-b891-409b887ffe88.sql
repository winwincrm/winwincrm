ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS platform   TEXT,
  ADD COLUMN IF NOT EXISTS amount     NUMERIC,
  ADD COLUMN IF NOT EXISTS timeframe  TEXT,
  ADD COLUMN IF NOT EXISTS percentage NUMERIC,
  ADD COLUMN IF NOT EXISTS madara_lead_id TEXT,
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name  TEXT;

ALTER TABLE public.leads ALTER COLUMN full_name DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.leads_fill_full_name()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.full_name IS NULL OR NEW.full_name = '' THEN
    NEW.full_name := NULLIF(trim(
      coalesce(NEW.first_name, NEW.payload->>'first_name', '') || ' ' ||
      coalesce(NEW.last_name,  NEW.payload->>'last_name',  '')
    ), '');
    IF NEW.full_name IS NULL THEN
      NEW.full_name := coalesce(NEW.email, NEW.phone, 'Unknown');
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS leads_fill_full_name ON public.leads;
CREATE TRIGGER leads_fill_full_name
BEFORE INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.leads_fill_full_name();

CREATE INDEX IF NOT EXISTS leads_madara_lead_id_idx
  ON public.leads(madara_lead_id);