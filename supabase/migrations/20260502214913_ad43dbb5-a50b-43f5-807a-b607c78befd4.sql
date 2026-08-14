CREATE OR REPLACE FUNCTION public.leads_use_madara_id()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.madara_lead_id IS NOT NULL
     AND NEW.madara_lead_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    NEW.id := NEW.madara_lead_id::uuid;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS leads_use_madara_id ON public.leads;
CREATE TRIGGER leads_use_madara_id
BEFORE INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.leads_use_madara_id();