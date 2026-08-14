
-- =========================================================
-- ENUMS
-- =========================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'office', 'agent');
CREATE TYPE public.user_status AS ENUM ('active', 'inactive');
CREATE TYPE public.office_status AS ENUM ('active', 'inactive');
CREATE TYPE public.lead_status AS ENUM (
  'New','Assigned','Contacted','No Answer','Follow Up',
  'Interested','Not Interested','Converted','Invalid','Closed'
);
CREATE TYPE public.lead_priority AS ENUM ('Low','Medium','High');
CREATE TYPE public.api_log_status AS ENUM ('success','failed');

-- =========================================================
-- UPDATED_AT helper
-- =========================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- =========================================================
-- OFFICES
-- =========================================================
CREATE TABLE public.offices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  status public.office_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_offices_updated_at
BEFORE UPDATE ON public.offices
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- PROFILES
-- =========================================================
CREATE TABLE public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  office_id UUID REFERENCES public.offices(id) ON DELETE SET NULL,
  status public.user_status NOT NULL DEFAULT 'active',
  language_preference TEXT NOT NULL DEFAULT 'en',
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_office ON public.profiles(office_id);
CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- USER ROLES (separate table — required for safe RLS)
-- =========================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- has_role() — security definer to avoid recursive RLS
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- get_user_office() — convenience for RLS
CREATE OR REPLACE FUNCTION public.get_user_office(_user_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT office_id FROM public.profiles WHERE user_id = _user_id;
$$;

-- =========================================================
-- LEADS
-- =========================================================
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID REFERENCES public.offices(id) ON DELETE SET NULL,
  assigned_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  amount NUMERIC,
  duration TEXT,
  percentage NUMERIC,
  source TEXT,
  campaign TEXT,
  status public.lead_status NOT NULL DEFAULT 'New',
  priority public.lead_priority NOT NULL DEFAULT 'Medium',
  custom_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_contacted_at TIMESTAMPTZ
);
CREATE INDEX idx_leads_office ON public.leads(office_id);
CREATE INDEX idx_leads_agent ON public.leads(assigned_agent_id);
CREATE INDEX idx_leads_status ON public.leads(status);
CREATE INDEX idx_leads_created ON public.leads(created_at DESC);

CREATE TRIGGER trg_leads_updated_at
BEFORE UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- LEAD COMMENTS
-- =========================================================
CREATE TABLE public.lead_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lead_comments_lead ON public.lead_comments(lead_id);

-- =========================================================
-- LEAD ACTIVITY
-- =========================================================
CREATE TABLE public.lead_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lead_activity_lead ON public.lead_activity(lead_id, created_at DESC);

-- Auto-log lead changes
CREATE OR REPLACE FUNCTION public.log_lead_changes()
RETURNS TRIGGER AS $$
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
    IF NEW.status = 'Contacted' THEN
      NEW.last_contacted_at := now();
    END IF;
  END IF;

  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    INSERT INTO public.lead_activity(lead_id, user_id, activity_type, old_value, new_value)
    VALUES (NEW.id, uid, 'priority_changed', OLD.priority::TEXT, NEW.priority::TEXT);
  END IF;

  IF NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id THEN
    INSERT INTO public.lead_activity(lead_id, user_id, activity_type, old_value, new_value)
    VALUES (NEW.id, uid, 'agent_changed',
            COALESCE(OLD.assigned_agent_id::TEXT,'(none)'),
            COALESCE(NEW.assigned_agent_id::TEXT,'(none)'));
  END IF;

  IF NEW.office_id IS DISTINCT FROM OLD.office_id THEN
    INSERT INTO public.lead_activity(lead_id, user_id, activity_type, old_value, new_value)
    VALUES (NEW.id, uid, 'office_changed',
            COALESCE(OLD.office_id::TEXT,'(none)'),
            COALESCE(NEW.office_id::TEXT,'(none)'));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_log_lead_insert
AFTER INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.log_lead_changes();

CREATE TRIGGER trg_log_lead_update
BEFORE UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.log_lead_changes();

-- =========================================================
-- IP WHITELIST
-- =========================================================
CREATE TABLE public.ip_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL,
  label TEXT,
  status public.user_status NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================
-- API LOGS
-- =========================================================
CREATE TABLE public.api_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT,
  status public.api_log_status NOT NULL,
  payload JSONB,
  error_message TEXT,
  office_id UUID REFERENCES public.offices(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_logs_created ON public.api_logs(created_at DESC);

-- =========================================================
-- OFFICE API KEYS (for future Madara intake)
-- =========================================================
CREATE TABLE public.office_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  label TEXT,
  status public.user_status NOT NULL DEFAULT 'active',
  last_used_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================
-- ENABLE RLS EVERYWHERE
-- =========================================================
ALTER TABLE public.offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ip_whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_api_keys ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- POLICIES — OFFICES
-- =========================================================
CREATE POLICY "Admin all offices" ON public.offices
FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Office reads own office" ON public.offices
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'office') AND id = public.get_user_office(auth.uid())
);

CREATE POLICY "Agent reads own office" ON public.offices
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'agent') AND id = public.get_user_office(auth.uid())
);

CREATE POLICY "Office updates own office" ON public.offices
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'office') AND id = public.get_user_office(auth.uid()))
WITH CHECK (public.has_role(auth.uid(),'office') AND id = public.get_user_office(auth.uid()));

-- =========================================================
-- POLICIES — PROFILES
-- =========================================================
CREATE POLICY "Read own profile" ON public.profiles
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Update own profile (limited)" ON public.profiles
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admin manages profiles" ON public.profiles
FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Office reads office profiles" ON public.profiles
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'office')
  AND office_id = public.get_user_office(auth.uid())
);

CREATE POLICY "Office manages own agents" ON public.profiles
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(),'office')
  AND office_id = public.get_user_office(auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(),'office')
  AND office_id = public.get_user_office(auth.uid())
);

-- =========================================================
-- POLICIES — USER_ROLES
-- =========================================================
CREATE POLICY "Read own roles" ON public.user_roles
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admin manages roles" ON public.user_roles
FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Office reads its agents roles" ON public.user_roles
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'office')
  AND user_id IN (
    SELECT user_id FROM public.profiles
    WHERE office_id = public.get_user_office(auth.uid())
  )
);

-- =========================================================
-- POLICIES — LEADS
-- =========================================================
CREATE POLICY "Admin all leads" ON public.leads
FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Office reads office leads" ON public.leads
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'office')
  AND office_id = public.get_user_office(auth.uid())
);

CREATE POLICY "Office updates office leads" ON public.leads
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(),'office')
  AND office_id = public.get_user_office(auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(),'office')
  AND office_id = public.get_user_office(auth.uid())
);

CREATE POLICY "Office inserts office leads" ON public.leads
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(),'office')
  AND office_id = public.get_user_office(auth.uid())
);

CREATE POLICY "Agent reads assigned leads" ON public.leads
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'agent')
  AND assigned_agent_id = auth.uid()
);

CREATE POLICY "Agent updates assigned leads" ON public.leads
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(),'agent')
  AND assigned_agent_id = auth.uid()
)
WITH CHECK (
  public.has_role(auth.uid(),'agent')
  AND assigned_agent_id = auth.uid()
);

-- =========================================================
-- POLICIES — LEAD COMMENTS
-- =========================================================
CREATE POLICY "Admin all comments" ON public.lead_comments
FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Office reads comments on office leads" ON public.lead_comments
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'office')
  AND lead_id IN (SELECT id FROM public.leads WHERE office_id = public.get_user_office(auth.uid()))
);

CREATE POLICY "Office writes comments on office leads" ON public.lead_comments
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.has_role(auth.uid(),'office')
  AND lead_id IN (SELECT id FROM public.leads WHERE office_id = public.get_user_office(auth.uid()))
);

CREATE POLICY "Agent reads comments on own leads" ON public.lead_comments
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'agent')
  AND lead_id IN (SELECT id FROM public.leads WHERE assigned_agent_id = auth.uid())
);

CREATE POLICY "Agent writes comments on own leads" ON public.lead_comments
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.has_role(auth.uid(),'agent')
  AND lead_id IN (SELECT id FROM public.leads WHERE assigned_agent_id = auth.uid())
);

-- =========================================================
-- POLICIES — LEAD ACTIVITY (read-only to non-admin)
-- =========================================================
CREATE POLICY "Admin all activity" ON public.lead_activity
FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Office reads activity on office leads" ON public.lead_activity
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'office')
  AND lead_id IN (SELECT id FROM public.leads WHERE office_id = public.get_user_office(auth.uid()))
);

CREATE POLICY "Agent reads activity on own leads" ON public.lead_activity
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'agent')
  AND lead_id IN (SELECT id FROM public.leads WHERE assigned_agent_id = auth.uid())
);

-- =========================================================
-- POLICIES — IP WHITELIST, API LOGS, OFFICE API KEYS (admin only)
-- =========================================================
CREATE POLICY "Admin only ip whitelist" ON public.ip_whitelist
FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admin only api logs" ON public.api_logs
FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admin only office api keys" ON public.office_api_keys
FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =========================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- (first user becomes admin so the system has an owner)
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_count INT;
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email, language_preference)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'language_preference','en')
  );

  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
