
CREATE OR REPLACE FUNCTION public.enforce_lead_office_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  caller uuid := auth.uid();
  assignee_office uuid;
BEGIN
  -- Server-side / no auth context: allow.
  IF caller IS NULL THEN
    RETURN NEW;
  END IF;

  -- Admins bypass.
  IF public.has_role(caller, 'admin') THEN
    RETURN NEW;
  END IF;

  -- Office managers cannot move leads to another office.
  IF TG_OP = 'UPDATE'
     AND public.has_role(caller, 'office')
     AND NEW.office_id IS DISTINCT FROM OLD.office_id THEN
    RAISE EXCEPTION 'Office managers cannot move leads to another office';
  END IF;

  -- Assigned user must belong to the same office as the lead.
  IF NEW.assigned_user_id IS NOT NULL AND NEW.office_id IS NOT NULL THEN
    SELECT office_id INTO assignee_office
    FROM public.profiles
    WHERE user_id = NEW.assigned_user_id;

    IF assignee_office IS DISTINCT FROM NEW.office_id THEN
      RAISE EXCEPTION 'Assigned agent must belong to the same office as the lead';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_lead_office_consistency_trg ON public.leads;
CREATE TRIGGER enforce_lead_office_consistency_trg
BEFORE INSERT OR UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.enforce_lead_office_consistency();
