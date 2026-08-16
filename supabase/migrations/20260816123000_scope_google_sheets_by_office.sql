-- Google Sheet links belong to one office. Admins can see every link; manager,
-- superiormanager and legacy supervisor accounts can see only their own office.

CREATE TABLE IF NOT EXISTS public.sheet_syncs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Google Sheet',
  sheet_url text NOT NULL,
  office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text,
  list_name text,
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  interval_seconds integer NOT NULL DEFAULT 60 CHECK (interval_seconds BETWEEN 5 AND 86400),
  enabled boolean NOT NULL DEFAULT true,
  update_existing boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_status text,
  last_error text,
  consecutive_failures integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sheet_sync_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_id uuid NOT NULL REFERENCES public.sheet_syncs(id) ON DELETE CASCADE,
  row_key text NOT NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  content_hash text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sync_id, row_key)
);

CREATE TABLE IF NOT EXISTS public.sheet_sync_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_id uuid REFERENCES public.sheet_syncs(id) ON DELETE SET NULL,
  sync_name text,
  sheet_url text,
  office_id uuid REFERENCES public.offices(id) ON DELETE SET NULL,
  kind text NOT NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  lead_name text,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- These columns are the ownership boundary. Keep this migration repair-safe if
-- the tables were created outside the checked-in migration history.
ALTER TABLE public.sheet_syncs ADD COLUMN IF NOT EXISTS office_id uuid;
ALTER TABLE public.sheet_sync_events ADD COLUMN IF NOT EXISTS office_id uuid;

CREATE INDEX IF NOT EXISTS idx_sheet_syncs_office_created
  ON public.sheet_syncs (office_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sheet_syncs_due
  ON public.sheet_syncs (enabled, next_run_at);
CREATE INDEX IF NOT EXISTS idx_sheet_sync_rows_sync
  ON public.sheet_sync_rows (sync_id);
CREATE INDEX IF NOT EXISTS idx_sheet_sync_rows_lead
  ON public.sheet_sync_rows (lead_id);
CREATE INDEX IF NOT EXISTS idx_sheet_sync_events_office_created
  ON public.sheet_sync_events (office_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sheet_sync_events_sync_created
  ON public.sheet_sync_events (sync_id, created_at DESC);

-- Repair old event ownership so existing history follows its sheet link.
UPDATE public.sheet_sync_events AS event
SET office_id = sync.office_id
FROM public.sheet_syncs AS sync
WHERE event.sync_id = sync.id
  AND event.office_id IS DISTINCT FROM sync.office_id;

-- Enforce office selection for all new links without breaking migration on a
-- legacy database that still has an admin-inbox link. Such a row remains
-- admin-only until an office is assigned; once repaired the constraint is
-- validated automatically on the next run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.sheet_syncs'::regclass
      AND conname = 'sheet_syncs_office_required'
  ) THEN
    ALTER TABLE public.sheet_syncs
      ADD CONSTRAINT sheet_syncs_office_required
      CHECK (office_id IS NOT NULL) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.sheet_syncs WHERE office_id IS NULL) THEN
    ALTER TABLE public.sheet_syncs VALIDATE CONSTRAINT sheet_syncs_office_required;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_sheet_office(target_office_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.user_roles AS roles
      JOIN public.profiles AS profile ON profile.user_id = roles.user_id
      WHERE roles.user_id = auth.uid()
        AND roles.role::text = 'admin'
        AND profile.status::text = 'active'
    )
    OR (
      target_office_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.profiles AS profile
        JOIN public.user_roles AS roles ON roles.user_id = profile.user_id
        WHERE profile.user_id = auth.uid()
          AND profile.status::text = 'active'
          AND profile.office_id = target_office_id
          AND roles.role::text IN ('manager', 'superiormanager', 'supervisor')
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_sheet_sync(target_sync_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sheet_syncs AS sync
    WHERE sync.id = target_sync_id
      AND public.can_access_sheet_office(sync.office_id)
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_sheet_office(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_sheet_sync(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_sheet_office(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_sheet_sync(uuid) TO authenticated;

ALTER TABLE public.sheet_syncs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sheet_sync_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sheet_sync_events ENABLE ROW LEVEL SECURITY;

-- Replace every previous policy on these three feature tables. PostgreSQL ORs
-- permissive policies, so leaving one broad legacy policy would leak links.
DO $$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('sheet_syncs', 'sheet_sync_rows', 'sheet_sync_events')
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

CREATE POLICY sheet_syncs_office_select
ON public.sheet_syncs
FOR SELECT
TO authenticated
USING (public.can_access_sheet_office(office_id));

CREATE POLICY sheet_sync_rows_office_select
ON public.sheet_sync_rows
FOR SELECT
TO authenticated
USING (public.can_access_sheet_sync(sync_id));

CREATE POLICY sheet_sync_events_office_select
ON public.sheet_sync_events
FOR SELECT
TO authenticated
USING (
  CASE
    WHEN sync_id IS NOT NULL THEN public.can_access_sheet_sync(sync_id)
    ELSE public.can_access_sheet_office(office_id)
  END
);

GRANT SELECT ON public.sheet_syncs, public.sheet_sync_rows, public.sheet_sync_events TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.sheet_syncs, public.sheet_sync_rows, public.sheet_sync_events FROM authenticated;
REVOKE ALL ON public.sheet_syncs, public.sheet_sync_rows, public.sheet_sync_events FROM anon;

NOTIFY pgrst, 'reload schema';
