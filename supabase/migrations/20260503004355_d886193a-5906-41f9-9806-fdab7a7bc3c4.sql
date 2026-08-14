-- ============================================================================
-- 1. PROFILES: Prevent privilege escalation via self-update
-- ============================================================================

-- Trigger to enforce immutability of sensitive columns
CREATE OR REPLACE FUNCTION public.profiles_guard_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
BEGIN
  -- Admin can change anything
  IF public.has_role(caller, 'admin') THEN
    RETURN NEW;
  END IF;

  -- Office role: can only manage profiles within their own office,
  -- cannot move a profile to a different office
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

  -- Self-update path: forbid sensitive column changes
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
$$;

DROP TRIGGER IF EXISTS profiles_guard_sensitive_columns ON public.profiles;
CREATE TRIGGER profiles_guard_sensitive_columns
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.profiles_guard_sensitive_columns();

-- ============================================================================
-- 2. LEAD COMMENTS: owner can update/delete own comments
-- ============================================================================

DROP POLICY IF EXISTS "Owner updates own comments" ON public.lead_comments;
CREATE POLICY "Owner updates own comments"
ON public.lead_comments
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Owner deletes own comments" ON public.lead_comments;
CREATE POLICY "Owner deletes own comments"
ON public.lead_comments
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- ============================================================================
-- 3. REALTIME: scope leads channel by office
-- ============================================================================

-- Stop broadcasting raw leads to every subscriber via postgres_changes
ALTER PUBLICATION supabase_realtime DROP TABLE public.leads;

-- Helper to broadcast lead change to per-office topic
CREATE OR REPLACE FUNCTION public.broadcast_lead_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  office uuid;
  topic text;
BEGIN
  rec := COALESCE(NEW, OLD);
  office := rec.office_id;
  IF office IS NULL THEN
    RETURN rec;
  END IF;

  topic := 'leads:office:' || office::text;

  PERFORM realtime.send(
    jsonb_build_object(
      'op', TG_OP,
      'lead_id', rec.id,
      'office_id', office,
      'new', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
      'old', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END
    ),
    'lead_change',
    topic,
    true  -- private channel
  );

  RETURN rec;
END;
$$;

DROP TRIGGER IF EXISTS leads_broadcast_change ON public.leads;
CREATE TRIGGER leads_broadcast_change
AFTER INSERT OR UPDATE OR DELETE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.broadcast_lead_change();

-- Realtime authorization: only office members (or admin) can subscribe
-- to their office's leads topic.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Office members read own office leads topic" ON realtime.messages;
CREATE POLICY "Office members read own office leads topic"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- Admin can subscribe to any leads:office:* topic
  (public.has_role(auth.uid(), 'admin')
    AND realtime.topic() LIKE 'leads:office:%')
  OR
  -- Office/agent: only their own office's topic
  (realtime.topic() = 'leads:office:' || public.get_user_office(auth.uid())::text)
);

-- ============================================================================
-- 4. REVOKE EXECUTE on internal helper functions from public roles
-- These are used inside RLS policies and security-definer triggers; signed-in
-- users do not need to call them directly via PostgREST.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_office(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_ip_allowed(text) FROM anon, authenticated;