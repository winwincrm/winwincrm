-- Make log_lead_changes run as definer so it can insert into lead_activity
-- regardless of the caller's RLS policies on that table.
CREATE OR REPLACE FUNCTION public.log_lead_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.lead_activity(lead_id, user_id, activity_type, new_value)
    VALUES (NEW.id, uid, 'created', NEW.status::TEXT);
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.lead_activity(lead_id, user_id, activity_type, old_value, new_value)
    VALUES (NEW.id, uid, 'status_changed', OLD.status::TEXT, NEW.status::TEXT);
    IF NEW.status = 'contacted' THEN
      NEW.last_contacted_at := now();
    END IF;
  END IF;

  IF NEW.assigned_user_id IS DISTINCT FROM OLD.assigned_user_id THEN
    INSERT INTO public.lead_activity(lead_id, user_id, activity_type, old_value, new_value)
    VALUES (NEW.id, uid, 'agent_changed',
            COALESCE(OLD.assigned_user_id::TEXT, '(none)'),
            COALESCE(NEW.assigned_user_id::TEXT, '(none)'));
  END IF;

  IF NEW.office_id IS DISTINCT FROM OLD.office_id THEN
    INSERT INTO public.lead_activity(lead_id, user_id, activity_type, old_value, new_value)
    VALUES (NEW.id, uid, 'office_changed',
            COALESCE(OLD.office_id::TEXT, '(none)'),
            COALESCE(NEW.office_id::TEXT, '(none)'));
  END IF;

  RETURN NEW;
END;
$function$;