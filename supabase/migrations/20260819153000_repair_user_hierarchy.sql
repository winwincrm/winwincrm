BEGIN;

-- One account must resolve to exactly one role. Older user creation code kept
-- the signup trigger's Agent row and then appended another role.
WITH ranked_roles AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id
      ORDER BY CASE role::text
        WHEN 'admin' THEN 4
        WHEN 'superiormanager' THEN 3
        WHEN 'supervisor' THEN 3
        WHEN 'manager' THEN 2
        WHEN 'agent' THEN 1
        ELSE 0
      END DESC, created_at ASC, id ASC
    ) AS role_number
  FROM public.user_roles
)
DELETE FROM public.user_roles AS roles
USING ranked_roles AS ranked
WHERE roles.id = ranked.id
  AND ranked.role_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_one_role_per_user
  ON public.user_roles (user_id);

CREATE INDEX IF NOT EXISTS profiles_manager_id_idx
  ON public.profiles (manager_id);

-- Keep a deleted manager from silently orphaning their reports. This is added
-- NOT VALID first so the migration remains diagnosable on an older database.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_manager_id_fkey'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_manager_id_fkey
      FOREIGN KEY (manager_id)
      REFERENCES public.profiles(user_id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS child
    LEFT JOIN public.profiles AS parent ON parent.user_id = child.manager_id
    WHERE child.manager_id IS NOT NULL
      AND parent.user_id IS NULL
  ) THEN
    ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_manager_id_fkey;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_role_text(target_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE role::text
    WHEN 'supervisor' THEN 'superiormanager'
    ELSE role::text
  END
  FROM public.user_roles
  WHERE user_id = target_user_id
  ORDER BY CASE role::text
    WHEN 'admin' THEN 4
    WHEN 'superiormanager' THEN 3
    WHEN 'supervisor' THEN 3
    WHEN 'manager' THEN 2
    WHEN 'agent' THEN 1
    ELSE 0
  END DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role_text()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.user_role_text(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = auth.uid()
      AND status::text = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_hierarchy_user(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    target_user_id = auth.uid()
    OR (
      public.current_user_is_active()
      AND (
        public.current_user_role_text() = 'admin'
        OR (
          public.current_user_role_text() IN ('manager', 'superiormanager')
          AND EXISTS (
            SELECT 1
            FROM public.profiles AS me
            JOIN public.profiles AS target ON target.user_id = target_user_id
            WHERE me.user_id = auth.uid()
              AND me.office_id IS NOT NULL
              AND target.office_id = me.office_id
          )
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_hierarchy_user(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    public.current_user_is_active()
    AND target_user_id <> auth.uid()
    AND (
      public.current_user_role_text() = 'admin'
      OR (
        public.current_user_role_text() = 'manager'
        AND public.user_role_text(target_user_id) = 'agent'
        AND EXISTS (
          SELECT 1
          FROM public.profiles AS target
          WHERE target.user_id = target_user_id
            AND target.manager_id = auth.uid()
            AND target.office_id = public.current_user_office_id()
        )
      )
      OR (
        public.current_user_role_text() = 'superiormanager'
        AND (
          (
            public.user_role_text(target_user_id) = 'manager'
            AND EXISTS (
              SELECT 1
              FROM public.profiles AS target
              WHERE target.user_id = target_user_id
                AND target.manager_id = auth.uid()
                AND target.office_id = public.current_user_office_id()
            )
          )
          OR (
            public.user_role_text(target_user_id) = 'agent'
            AND EXISTS (
              SELECT 1
              FROM public.profiles AS target
              JOIN public.profiles AS parent ON parent.user_id = target.manager_id
              WHERE target.user_id = target_user_id
                AND target.office_id = public.current_user_office_id()
                AND parent.manager_id = auth.uid()
                AND parent.office_id = target.office_id
                AND public.user_role_text(parent.user_id) = 'manager'
            )
          )
        )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.user_role_text(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_role_text() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_is_active() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_hierarchy_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_hierarchy_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_role_text() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_is_active() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_hierarchy_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_hierarchy_user(uuid) TO authenticated;

-- Remove the previous overlapping policies. Permissive policies are ORed, so
-- leaving one old team/supervisor policy would bypass the repaired hierarchy.
DO $$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('profiles', 'user_roles', 'offices')
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  END LOOP;
END;
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offices ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_hierarchy_select
ON public.profiles
FOR SELECT
TO authenticated
USING (public.can_view_hierarchy_user(user_id));

CREATE POLICY profiles_self_update
ON public.profiles
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY user_roles_hierarchy_select
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.can_view_hierarchy_user(user_id));

CREATE POLICY offices_hierarchy_select
ON public.offices
FOR SELECT
TO authenticated
USING (
  public.current_user_is_active()
  AND (
    public.current_user_role_text() = 'admin'
    OR id = public.current_user_office_id()
  )
);

CREATE POLICY offices_hierarchy_update
ON public.offices
FOR UPDATE
TO authenticated
USING (
  public.current_user_is_active()
  AND (
    public.current_user_role_text() = 'admin'
    OR (
      public.current_user_role_text() IN ('manager', 'superiormanager')
      AND id = public.current_user_office_id()
    )
  )
)
WITH CHECK (
  public.current_user_is_active()
  AND (
    public.current_user_role_text() = 'admin'
    OR (
      public.current_user_role_text() IN ('manager', 'superiormanager')
      AND id = public.current_user_office_id()
    )
  )
);

CREATE POLICY offices_admin_insert
ON public.offices
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_user_is_active()
  AND public.current_user_role_text() = 'admin'
);

GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.offices TO authenticated;
REVOKE DELETE ON public.offices FROM authenticated;

CREATE OR REPLACE FUNCTION public.offices_guard_manager_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.current_user_role_text() = 'admin' THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Cannot change office id'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'Only admins can change office status'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS offices_guard_manager_status ON public.offices;
CREATE TRIGGER offices_guard_manager_status
BEFORE UPDATE ON public.offices
FOR EACH ROW
EXECUTE FUNCTION public.offices_guard_manager_status();

REVOKE ALL ON FUNCTION public.offices_guard_manager_status() FROM PUBLIC;

-- Self-service profile edits may never move a user within the hierarchy.
CREATE OR REPLACE FUNCTION public.profiles_guard_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller uuid := auth.uid();
BEGIN
  IF auth.role() = 'service_role' OR caller IS NULL THEN
    RETURN NEW;
  END IF;
  IF caller IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Profile administration must use the secured server endpoint';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'Cannot change user_id'; END IF;
  IF NEW.office_id IS DISTINCT FROM OLD.office_id THEN RAISE EXCEPTION 'Cannot change office_id'; END IF;
  IF NEW.manager_id IS DISTINCT FROM OLD.manager_id THEN RAISE EXCEPTION 'Cannot change manager_id'; END IF;
  IF NEW.team_id IS DISTINCT FROM OLD.team_id THEN RAISE EXCEPTION 'Cannot change team_id'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'Cannot change status'; END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN RAISE EXCEPTION 'Cannot change email'; END IF;
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

REVOKE ALL ON FUNCTION public.profiles_guard_sensitive_columns() FROM PUBLIC;

NOTIFY pgrst, 'reload schema';

COMMIT;
