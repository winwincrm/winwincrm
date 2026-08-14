ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

UPDATE public.leads
SET assigned_at = updated_at
WHERE assigned_user_id IS NOT NULL AND assigned_at IS NULL;

CREATE OR REPLACE FUNCTION public.leads_set_assigned_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_user_id IS NOT NULL AND NEW.assigned_at IS NULL THEN
      NEW.assigned_at := now();
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.assigned_user_id IS DISTINCT FROM OLD.assigned_user_id THEN
      IF NEW.assigned_user_id IS NULL THEN
        NEW.assigned_at := NULL;
      ELSE
        NEW.assigned_at := now();
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_set_assigned_at ON public.leads;
CREATE TRIGGER leads_set_assigned_at
  BEFORE INSERT OR UPDATE OF assigned_user_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_set_assigned_at();

CREATE INDEX IF NOT EXISTS leads_assigned_at_desc_idx
  ON public.leads (assigned_at DESC NULLS LAST);