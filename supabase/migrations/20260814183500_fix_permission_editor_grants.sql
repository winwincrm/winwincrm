BEGIN;

-- PostgreSQL table privileges are checked before RLS. These tables already
-- have admin-only write policies, but authenticated users previously had only
-- SELECT, so even admins were rejected before the policies could run.
GRANT INSERT, UPDATE, DELETE ON TABLE public.role_permissions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.user_permission_overrides TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
