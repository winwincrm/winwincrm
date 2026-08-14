CREATE OR REPLACE FUNCTION public.profiles_guard_sensitive_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  caller uuid := auth.uid();
BEGIN
  -- Service role / no auth context: allow (server-side admin ops)
  IF caller IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.has_role(caller, 'admin') THEN
    RETURN NEW;
  END IF;

  IF public.has_role(caller, 'office') THEN
    IF OLD.office_id IS DISTINCT FROM public.get_user_office(caller) THEN
      RAISE EXCEPTION 'Not allowed to modify this profile';
    END IF;
    IF NEW.office_id IS DISTINCT FROM OLD.office_id THEN
      RAISE EXCEPTION 'Office managers cannot move profiles to another office';
    END IF;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Cannot change user_id';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Cannot change user_id';
  END IF;
  IF NEW.office_id IS DISTINCT FROM OLD.office_id THEN
    RAISE EXCEPTION 'Cannot change office_id';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Cannot change status';
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'Cannot change email';
  END IF;
  IF NEW.must_change_password IS DISTINCT FROM OLD.must_change_password
     AND NEW.must_change_password = true THEN
    RAISE EXCEPTION 'Cannot re-enable must_change_password on yourself';
  END IF;

  RETURN NEW;
END;
$function$;