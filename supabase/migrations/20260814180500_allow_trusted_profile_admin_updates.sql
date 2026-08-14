BEGIN;

-- Trusted service-role operations (user creation, password resets, and account
-- administration) must not be treated as a user's self-service profile update.
-- RLS remains responsible for deciding whether authenticated users may update
-- profiles belonging to other users.
CREATE OR REPLACE FUNCTION public.profiles_guard_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
BEGIN
  IF auth.role() = 'service_role' OR caller IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Cannot change user_id';
  END IF;

  -- Updates to another user's profile have already passed table RLS. The
  -- restrictions below apply only to a user's own self-service update.
  IF caller IS DISTINCT FROM OLD.user_id THEN
    RETURN NEW;
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
$$;

DROP TRIGGER IF EXISTS profiles_guard_sensitive_columns ON public.profiles;
CREATE TRIGGER profiles_guard_sensitive_columns
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.profiles_guard_sensitive_columns();

COMMIT;
