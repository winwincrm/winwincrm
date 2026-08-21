BEGIN;

-- A NULL office_id means the source is independent/global. A populated
-- office_id means the source may only be used for leads in that office.
CREATE TABLE IF NOT EXISTS public.lead_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_sources
  ADD COLUMN IF NOT EXISTS office_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.lead_sources'::regclass
      AND conname = 'lead_sources_office_id_fkey'
  ) THEN
    ALTER TABLE public.lead_sources
      ADD CONSTRAINT lead_sources_office_id_fkey
      FOREIGN KEY (office_id)
      REFERENCES public.offices(id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.lead_sources AS source
    LEFT JOIN public.offices AS office ON office.id = source.office_id
    WHERE source.office_id IS NOT NULL
      AND office.id IS NULL
  ) THEN
    ALTER TABLE public.lead_sources
      VALIDATE CONSTRAINT lead_sources_office_id_fkey;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS lead_sources_office_id_idx
  ON public.lead_sources (office_id);

-- Leads still store the source name as text, so names must identify exactly
-- one registration even when letter casing differs.
CREATE UNIQUE INDEX IF NOT EXISTS lead_sources_normalized_name_unique_idx
  ON public.lead_sources (lower(btrim(name)));

CREATE OR REPLACE FUNCTION public.can_view_lead_source(target_office_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    WHERE profile.user_id = auth.uid()
      AND profile.status::text = 'active'
      AND (
        target_office_id IS NULL
        OR profile.office_id = target_office_id
        OR EXISTS (
          SELECT 1
          FROM public.user_roles AS role
          WHERE role.user_id = auth.uid()
            AND role.role::text = 'admin'
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_lead_sources()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    JOIN public.user_roles AS role ON role.user_id = profile.user_id
    WHERE profile.user_id = auth.uid()
      AND profile.status::text = 'active'
      AND role.role::text = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.can_view_lead_source(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_lead_sources() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_lead_source(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_lead_sources() TO authenticated;

-- Permissive RLS policies are ORed. Remove every older lead_sources policy so
-- none can accidentally expose another office's source list.
DO $$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lead_sources'
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

ALTER TABLE public.lead_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY lead_sources_scoped_select
ON public.lead_sources
FOR SELECT
TO authenticated
USING (public.can_view_lead_source(office_id));

CREATE POLICY lead_sources_admin_insert
ON public.lead_sources
FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_lead_sources());

CREATE POLICY lead_sources_admin_update
ON public.lead_sources
FOR UPDATE
TO authenticated
USING (public.can_manage_lead_sources())
WITH CHECK (public.can_manage_lead_sources());

CREATE POLICY lead_sources_admin_delete
ON public.lead_sources
FOR DELETE
TO authenticated
USING (public.can_manage_lead_sources());

REVOKE ALL ON TABLE public.lead_sources FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lead_sources TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_lead_source_office()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  registered_office_id uuid;
BEGIN
  IF NEW.source IS NULL OR btrim(NEW.source) = '' THEN
    RETURN NEW;
  END IF;

  SELECT source.office_id
  INTO registered_office_id
  FROM public.lead_sources AS source
  WHERE lower(btrim(source.name)) = lower(btrim(NEW.source))
  LIMIT 1;

  -- FOUND distinguishes a registered Global source (NULL) from no matching
  -- registration. Unregistered/custom source tags remain supported.
  IF FOUND
    AND registered_office_id IS NOT NULL
    AND NEW.office_id IS DISTINCT FROM registered_office_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format(
        'Source "%s" is assigned to another office and cannot be used for this lead.',
        NEW.source
      );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_lead_source_office() FROM PUBLIC;

DROP TRIGGER IF EXISTS leads_validate_source_office ON public.leads;
CREATE TRIGGER leads_validate_source_office
BEFORE INSERT OR UPDATE OF source, office_id
ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.validate_lead_source_office();

CREATE OR REPLACE FUNCTION public.validate_lead_source_registration_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.office_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.leads AS lead
      WHERE lower(btrim(lead.source)) = lower(btrim(NEW.name))
        AND lead.deleted_at IS NULL
        AND lead.office_id IS DISTINCT FROM NEW.office_id
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format(
        'Source "%s" is already used by leads outside the selected office. Move or retag those leads before limiting this source.',
        NEW.name
      );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_lead_source_registration_scope() FROM PUBLIC;

DROP TRIGGER IF EXISTS lead_sources_validate_office_scope ON public.lead_sources;
CREATE TRIGGER lead_sources_validate_office_scope
BEFORE INSERT OR UPDATE OF name, office_id
ON public.lead_sources
FOR EACH ROW
EXECUTE FUNCTION public.validate_lead_source_registration_scope();

NOTIFY pgrst, 'reload schema';

COMMIT;
