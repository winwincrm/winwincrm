
CREATE OR REPLACE FUNCTION public.log_lead_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.lead_activity(lead_id, user_id, activity_type, field_name, old_value, new_value)
    VALUES (NEW.id, COALESCE(v_uid, NEW.assigned_user_id), 'created', 'status', NULL, to_jsonb(NEW.status::text));
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.lead_activity(lead_id, user_id, activity_type, field_name, old_value, new_value)
    VALUES (NEW.id, v_uid, 'status_changed', 'status', to_jsonb(OLD.status::text), to_jsonb(NEW.status::text));
  END IF;

  IF NEW.assigned_user_id IS DISTINCT FROM OLD.assigned_user_id THEN
    INSERT INTO public.lead_activity(lead_id, user_id, activity_type, field_name, old_value, new_value)
    VALUES (NEW.id, v_uid, 'assigned', 'assigned_user_id',
            CASE WHEN OLD.assigned_user_id IS NULL THEN NULL ELSE to_jsonb(OLD.assigned_user_id::text) END,
            CASE WHEN NEW.assigned_user_id IS NULL THEN NULL ELSE to_jsonb(NEW.assigned_user_id::text) END);
  END IF;

  IF NEW.office_id IS DISTINCT FROM OLD.office_id THEN
    INSERT INTO public.lead_activity(lead_id, user_id, activity_type, field_name, old_value, new_value)
    VALUES (NEW.id, v_uid, 'office_changed', 'office_id',
            CASE WHEN OLD.office_id IS NULL THEN NULL ELSE to_jsonb(OLD.office_id::text) END,
            CASE WHEN NEW.office_id IS NULL THEN NULL ELSE to_jsonb(NEW.office_id::text) END);
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS leads_log_changes ON public.leads;
CREATE TRIGGER leads_log_changes
AFTER INSERT OR UPDATE OF status, assigned_user_id, office_id ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.log_lead_changes();
