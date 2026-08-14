CREATE OR REPLACE FUNCTION public.leads_set_assigned_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_user_id IS NOT NULL AND NEW.assigned_at IS NULL THEN
      NEW.assigned_at := now();
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only stamp on the FIRST assignment (null -> value).
    -- Re-assignments between agents do NOT bump assigned_at, so analytics
    -- counts by assignment date reflect when a lead was originally routed.
    IF NEW.assigned_user_id IS NOT NULL
       AND OLD.assigned_user_id IS NULL
       AND NEW.assigned_at IS NULL THEN
      NEW.assigned_at := now();
    END IF;
    -- Clearing the assignee leaves assigned_at intact (historical record).
  END IF;
  RETURN NEW;
END;
$function$;