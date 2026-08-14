-- 1. Helper to check current user's access to a given lead
CREATE OR REPLACE FUNCTION public.can_access_lead(_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.leads l
    WHERE l.id = _lead_id
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR l.assigned_user_id = auth.uid()
        OR (
          public.has_role(auth.uid(), 'manager'::public.app_role)
          AND l.office_id = public.current_user_office_id()
        )
        OR (
          public.has_role(auth.uid(), 'supervisor'::public.app_role)
          AND public.is_user_in_current_user_team(l.assigned_user_id)
        )
      )
  );
$$;
GRANT EXECUTE ON FUNCTION public.can_access_lead(uuid) TO authenticated;

-- 2. Fix offices_read: only own office (admin policy already exists)
DROP POLICY IF EXISTS offices_read ON public.offices;
CREATE POLICY offices_read_own
ON public.offices
FOR SELECT
TO authenticated
USING (id = public.current_user_office_id());

-- 3. Replace broken lead_comments_visible
DROP POLICY IF EXISTS lead_comments_visible ON public.lead_comments;
CREATE POLICY lead_comments_visible
ON public.lead_comments
FOR ALL
TO authenticated
USING (public.can_access_lead(lead_id))
WITH CHECK (public.can_access_lead(lead_id));

-- 4. Replace broken lead_activity_visible
DROP POLICY IF EXISTS lead_activity_visible ON public.lead_activity;
CREATE POLICY lead_activity_visible
ON public.lead_activity
FOR ALL
TO authenticated
USING (public.can_access_lead(lead_id))
WITH CHECK (public.can_access_lead(lead_id));

-- 5. Add lead_transfers non-admin access (read/create for users with access to the lead)
CREATE POLICY lead_transfers_lead_access
ON public.lead_transfers
FOR ALL
TO authenticated
USING (public.can_access_lead(lead_id))
WITH CHECK (public.can_access_lead(lead_id));

-- 6. Fix profiles_manager_office & profiles_supervisor_team roles
DROP POLICY IF EXISTS profiles_manager_office ON public.profiles;
DROP POLICY IF EXISTS profiles_supervisor_team ON public.profiles;
CREATE POLICY profiles_manager_office
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  AND office_id = public.current_user_office_id()
);
CREATE POLICY profiles_supervisor_team
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'supervisor'::public.app_role)
  AND team_id = public.current_user_team_id()
);

-- 7. Remove leads from broad postgres_changes publication; app uses private broadcast channels.
ALTER PUBLICATION supabase_realtime DROP TABLE public.leads;

-- 8. RLS on realtime.messages restricting access to private office broadcast channels.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_office_broadcast_access" ON realtime.messages;
CREATE POLICY "leads_office_broadcast_access"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() LIKE 'leads:office:%'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR substring(realtime.topic() from 'leads:office:(.*)$')::uuid = public.current_user_office_id()
  )
);

DROP POLICY IF EXISTS "leads_office_broadcast_send" ON realtime.messages;
CREATE POLICY "leads_office_broadcast_send"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() LIKE 'leads:office:%'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR substring(realtime.topic() from 'leads:office:(.*)$')::uuid = public.current_user_office_id()
  )
);