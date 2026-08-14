BEGIN;

UPDATE public.profiles
SET must_change_password = false
WHERE must_change_password = true;

ALTER TABLE public.profiles
  ALTER COLUMN must_change_password SET DEFAULT false;

COMMENT ON COLUMN public.profiles.must_change_password IS
  'Legacy compatibility flag. Passwords are administrator-managed and this value remains false.';

NOTIFY pgrst, 'reload schema';

COMMIT;
