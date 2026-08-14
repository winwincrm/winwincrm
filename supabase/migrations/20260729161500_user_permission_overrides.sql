CREATE TABLE IF NOT EXISTS public.user_permission_overrides (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  nav_items   jsonb NOT NULL DEFAULT '{}'::jsonb,
  actions     jsonb NOT NULL DEFAULT '{}'::jsonb,
  dashboard   jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid
);

GRANT SELECT ON public.user_permission_overrides TO authenticated;
GRANT ALL    ON public.user_permission_overrides TO service_role;

ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "upo_read_self_or_admin" ON public.user_permission_overrides;
CREATE POLICY "upo_read_self_or_admin" ON public.user_permission_overrides
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "upo_admin_write" ON public.user_permission_overrides;
CREATE POLICY "upo_admin_write" ON public.user_permission_overrides
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
