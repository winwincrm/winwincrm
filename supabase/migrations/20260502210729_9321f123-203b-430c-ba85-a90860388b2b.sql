
-- =========================================================================
-- DESTRUCTIVE: Replace leads schema
-- =========================================================================

-- 1. Drop dependents (cascade handles FK + policies)
DROP TABLE IF EXISTS public.lead_activity CASCADE;
DROP TABLE IF EXISTS public.lead_comments CASCADE;
DROP TABLE IF EXISTS public.leads CASCADE;
DROP FUNCTION IF EXISTS public.log_lead_changes() CASCADE;

-- 2. Drop old enums
DROP TYPE IF EXISTS public.lead_status CASCADE;
DROP TYPE IF EXISTS public.lead_priority CASCADE;

-- 3. Create new enum
CREATE TYPE public.lead_status AS ENUM (
  'new', 'contacted', 'qualified', 'converted', 'rejected', 'lost',
  'no_answer_1', 'no_answer_2', 'no_answer_3',
  'callback', 'wrong_number', 'not_available', 'try_again', 'appointment'
);

-- 4. Create new leads table
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  source TEXT,
  status public.lead_status NOT NULL DEFAULT 'new',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  office_id UUID REFERENCES public.offices(id) ON DELETE SET NULL,
  assigned_user_id UUID,
  madara_lead_id TEXT,
  external_lead_id TEXT,
  last_contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_leads_office_id ON public.leads(office_id);
CREATE INDEX idx_leads_assigned_user_id ON public.leads(assigned_user_id);
CREATE INDEX idx_leads_status ON public.leads(status);
CREATE INDEX idx_leads_created_at ON public.leads(created_at DESC);

-- 5. RLS on leads
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.leads
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Admin all leads" ON public.leads
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Office reads office leads" ON public.leads
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'office') AND office_id = public.get_user_office(auth.uid()));

CREATE POLICY "Office inserts office leads" ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'office') AND office_id = public.get_user_office(auth.uid()));

CREATE POLICY "Office updates office leads" ON public.leads
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'office') AND office_id = public.get_user_office(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'office') AND office_id = public.get_user_office(auth.uid()));

CREATE POLICY "Agent reads assigned leads" ON public.leads
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'agent') AND assigned_user_id = auth.uid());

CREATE POLICY "Agent updates assigned leads" ON public.leads
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'agent') AND assigned_user_id = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'agent') AND assigned_user_id = auth.uid());

-- 6. updated_at trigger
CREATE TRIGGER trg_leads_set_updated_at
BEFORE UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. Recreate lead_comments
CREATE TABLE public.lead_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_comments_lead_id ON public.lead_comments(lead_id);

ALTER TABLE public.lead_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin all comments" ON public.lead_comments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Office reads comments on office leads" ON public.lead_comments
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'office')
    AND lead_id IN (SELECT id FROM public.leads WHERE office_id = public.get_user_office(auth.uid()))
  );

CREATE POLICY "Office writes comments on office leads" ON public.lead_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_role(auth.uid(), 'office')
    AND lead_id IN (SELECT id FROM public.leads WHERE office_id = public.get_user_office(auth.uid()))
  );

CREATE POLICY "Agent reads comments on own leads" ON public.lead_comments
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'agent')
    AND lead_id IN (SELECT id FROM public.leads WHERE assigned_user_id = auth.uid())
  );

CREATE POLICY "Agent writes comments on own leads" ON public.lead_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_role(auth.uid(), 'agent')
    AND lead_id IN (SELECT id FROM public.leads WHERE assigned_user_id = auth.uid())
  );

-- 8. Recreate lead_activity
CREATE TABLE public.lead_activity (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID,
  activity_type TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_activity_lead_id ON public.lead_activity(lead_id);
CREATE INDEX idx_lead_activity_created_at ON public.lead_activity(created_at DESC);

ALTER TABLE public.lead_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin all activity" ON public.lead_activity
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Office reads activity on office leads" ON public.lead_activity
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'office')
    AND lead_id IN (SELECT id FROM public.leads WHERE office_id = public.get_user_office(auth.uid()))
  );

CREATE POLICY "Agent reads activity on own leads" ON public.lead_activity
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'agent')
    AND lead_id IN (SELECT id FROM public.leads WHERE assigned_user_id = auth.uid())
  );

-- 9. Recreate log_lead_changes trigger function (no priority, new column names)
CREATE OR REPLACE FUNCTION public.log_lead_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.lead_activity(lead_id, user_id, activity_type, new_value)
    VALUES (NEW.id, uid, 'created', NEW.status::TEXT);
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.lead_activity(lead_id, user_id, activity_type, old_value, new_value)
    VALUES (NEW.id, uid, 'status_changed', OLD.status::TEXT, NEW.status::TEXT);
    IF NEW.status = 'contacted' THEN
      NEW.last_contacted_at := now();
    END IF;
  END IF;

  IF NEW.assigned_user_id IS DISTINCT FROM OLD.assigned_user_id THEN
    INSERT INTO public.lead_activity(lead_id, user_id, activity_type, old_value, new_value)
    VALUES (NEW.id, uid, 'agent_changed',
            COALESCE(OLD.assigned_user_id::TEXT, '(none)'),
            COALESCE(NEW.assigned_user_id::TEXT, '(none)'));
  END IF;

  IF NEW.office_id IS DISTINCT FROM OLD.office_id THEN
    INSERT INTO public.lead_activity(lead_id, user_id, activity_type, old_value, new_value)
    VALUES (NEW.id, uid, 'office_changed',
            COALESCE(OLD.office_id::TEXT, '(none)'),
            COALESCE(NEW.office_id::TEXT, '(none)'));
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_leads_log_changes
BEFORE INSERT OR UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.log_lead_changes();
