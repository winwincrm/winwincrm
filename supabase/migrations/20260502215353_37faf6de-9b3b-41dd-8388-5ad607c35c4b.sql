CREATE OR REPLACE FUNCTION public.leads_use_madara_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  candidate_id text;
BEGIN
  candidate_id := COALESCE(
    NULLIF(NEW.madara_lead_id, ''),
    NULLIF(NEW.external_lead_id, ''),
    NULLIF(NEW.payload->>'madara_lead_id', ''),
    NULLIF(NEW.payload->>'lead_id', ''),
    NULLIF(NEW.payload->>'id', '')
  );

  IF candidate_id IS NOT NULL
     AND candidate_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    NEW.id := candidate_id::uuid;
    NEW.madara_lead_id := COALESCE(NULLIF(NEW.madara_lead_id, ''), candidate_id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.leads_fill_full_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.full_name IS NULL OR btrim(NEW.full_name) = '' THEN
    NEW.full_name := NULLIF(btrim(
      COALESCE(NULLIF(NEW.first_name, ''), NEW.payload->>'first_name', '') || ' ' ||
      COALESCE(NULLIF(NEW.last_name, ''),  NEW.payload->>'last_name',  '')
    ), '');

    IF NEW.full_name IS NULL THEN
      NEW.full_name := COALESCE(
        NULLIF(NEW.email, ''),
        NULLIF(NEW.phone, ''),
        'Unknown'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_use_madara_id ON public.leads;
CREATE TRIGGER leads_use_madara_id
BEFORE INSERT ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.leads_use_madara_id();

DROP TRIGGER IF EXISTS leads_fill_full_name ON public.leads;
CREATE TRIGGER leads_fill_full_name
BEFORE INSERT ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.leads_fill_full_name();

DROP TRIGGER IF EXISTS trg_leads_log_changes ON public.leads;
CREATE TRIGGER trg_leads_log_changes
AFTER INSERT OR UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.log_lead_changes();