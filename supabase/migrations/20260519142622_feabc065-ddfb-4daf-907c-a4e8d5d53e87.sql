ALTER TABLE public.leads ALTER COLUMN lead_kind DROP EXPRESSION;

CREATE OR REPLACE FUNCTION public.leads_autofill_lead_kind()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.lead_kind IS NULL THEN
    NEW.lead_kind := public.compute_lead_kind(NEW.full_name, NEW.first_name, NEW.last_name);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_autofill_lead_kind ON public.leads;
CREATE TRIGGER leads_autofill_lead_kind
BEFORE INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.leads_autofill_lead_kind();