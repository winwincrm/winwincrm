
-- =====================================================================
-- CRM schema (clean rebuild on blank database)
-- Hierarchy: admin → manager → supervisor → agent
-- =====================================================================

-- Roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'supervisor', 'agent');

-- Updated-at trigger helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ---------- offices ----------
CREATE TABLE public.offices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offices TO authenticated;
GRANT ALL ON public.offices TO service_role;
ALTER TABLE public.offices ENABLE ROW LEVEL SECURITY;

-- ---------- teams (under an office, run by a supervisor) ----------
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  supervisor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- ---------- profiles ----------
CREATE TABLE public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  office_id UUID REFERENCES public.offices(id) ON DELETE SET NULL,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  language_preference TEXT NOT NULL DEFAULT 'en',
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- user_roles ----------
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ---------- has_role security-definer helper ----------
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- ---------- auto-create profile on signup ----------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------- leads ----------
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  office_id UUID REFERENCES public.offices(id) ON DELETE SET NULL,
  assigned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source TEXT,
  platform TEXT,
  amount NUMERIC,
  percentage NUMERIC,
  timeframe TEXT,
  payload JSONB,
  last_contacted_at TIMESTAMPTZ,
  assigned_at TIMESTAMPTZ,
  lead_kind TEXT,
  is_in_house BOOLEAN DEFAULT false,
  hide_in_house_from_agents BOOLEAN DEFAULT false,
  origin_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  origin_agent_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX leads_office_idx ON public.leads(office_id);
CREATE INDEX leads_assigned_user_idx ON public.leads(assigned_user_id);
CREATE INDEX leads_status_idx ON public.leads(status);
CREATE INDEX leads_created_at_idx ON public.leads(created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER leads_set_updated_at BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- lead_comments ----------
CREATE TABLE public.lead_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lead_comments_lead_idx ON public.lead_comments(lead_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_comments TO authenticated;
GRANT ALL ON public.lead_comments TO service_role;
ALTER TABLE public.lead_comments ENABLE ROW LEVEL SECURITY;

-- ---------- lead_activity ----------
CREATE TABLE public.lead_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lead_activity_lead_idx ON public.lead_activity(lead_id);
CREATE INDEX lead_activity_created_at_idx ON public.lead_activity(created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_activity TO authenticated;
GRANT ALL ON public.lead_activity TO service_role;
ALTER TABLE public.lead_activity ENABLE ROW LEVEL SECURITY;

-- ---------- lead_transfers ----------
CREATE TABLE public.lead_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  from_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_transfers TO authenticated;
GRANT ALL ON public.lead_transfers TO service_role;
ALTER TABLE public.lead_transfers ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER lead_transfers_set_updated_at BEFORE UPDATE ON public.lead_transfers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- office_api_keys ----------
CREATE TABLE public.office_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  label TEXT,
  key_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  last_used_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.office_api_keys TO authenticated;
GRANT ALL ON public.office_api_keys TO service_role;
ALTER TABLE public.office_api_keys ENABLE ROW LEVEL SECURITY;

-- ---------- affiliates ----------
CREATE TABLE public.affiliates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.affiliates TO authenticated;
GRANT ALL ON public.affiliates TO service_role;
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER affiliates_set_updated_at BEFORE UPDATE ON public.affiliates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.affiliate_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  label TEXT,
  key_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  last_used_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.affiliate_api_keys TO authenticated;
GRANT ALL ON public.affiliate_api_keys TO service_role;
ALTER TABLE public.affiliate_api_keys ENABLE ROW LEVEL SECURITY;

-- ---------- api_logs ----------
CREATE TABLE public.api_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT,
  endpoint TEXT,
  ip TEXT,
  status TEXT,
  payload JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX api_logs_created_at_idx ON public.api_logs(created_at DESC);
GRANT SELECT, INSERT ON public.api_logs TO authenticated;
GRANT ALL ON public.api_logs TO service_role;
ALTER TABLE public.api_logs ENABLE ROW LEVEL SECURITY;

-- ---------- ip_whitelist + is_ip_allowed RPC ----------
CREATE TABLE public.ip_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip TEXT NOT NULL UNIQUE,
  label TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ip_whitelist TO authenticated;
GRANT ALL ON public.ip_whitelist TO service_role;
ALTER TABLE public.ip_whitelist ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_ip_allowed(_ip TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.ip_whitelist)
      OR EXISTS (SELECT 1 FROM public.ip_whitelist WHERE ip = _ip);
$$;

-- ---------- contact_requests ----------
CREATE TABLE public.contact_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT,
  name TEXT,
  email TEXT,
  phone TEXT,
  payload JSONB,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_requests TO authenticated;
GRANT ALL ON public.contact_requests TO service_role;
ALTER TABLE public.contact_requests ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- RLS policies
-- =====================================================================

-- offices: admins manage; everyone authenticated can read
CREATE POLICY offices_admin_all ON public.offices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY offices_read ON public.offices FOR SELECT TO authenticated USING (true);

-- teams: admins all; managers in their office; supervisors read their team; agents read their team
CREATE POLICY teams_admin_all ON public.teams FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY teams_manager_office ON public.teams FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager')
    AND office_id = (SELECT office_id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'manager')
    AND office_id = (SELECT office_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY teams_member_read ON public.teams FOR SELECT TO authenticated
  USING (id = (SELECT team_id FROM public.profiles WHERE user_id = auth.uid()));

-- profiles: self always; admins all; managers same office; supervisors same team
CREATE POLICY profiles_self ON public.profiles FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY profiles_admin_all ON public.profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY profiles_manager_office ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'manager')
    AND office_id = (SELECT office_id FROM public.profiles p WHERE p.user_id = auth.uid()));
CREATE POLICY profiles_supervisor_team ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'supervisor')
    AND team_id = (SELECT team_id FROM public.profiles p WHERE p.user_id = auth.uid()));

-- user_roles: self read; admins all
CREATE POLICY user_roles_self_read ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY user_roles_admin_all ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- leads: admins all; managers their office; supervisors their team agents; agents their own
CREATE POLICY leads_admin_all ON public.leads FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY leads_manager_office ON public.leads FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager')
    AND office_id = (SELECT office_id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'manager')
    AND office_id = (SELECT office_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY leads_supervisor_team ON public.leads FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'supervisor')
    AND assigned_user_id IN (
      SELECT user_id FROM public.profiles
      WHERE team_id = (SELECT team_id FROM public.profiles WHERE user_id = auth.uid())
    ))
  WITH CHECK (public.has_role(auth.uid(), 'supervisor')
    AND assigned_user_id IN (
      SELECT user_id FROM public.profiles
      WHERE team_id = (SELECT team_id FROM public.profiles WHERE user_id = auth.uid())
    ));
CREATE POLICY leads_agent_own ON public.leads FOR ALL TO authenticated
  USING (assigned_user_id = auth.uid())
  WITH CHECK (assigned_user_id = auth.uid());

-- lead_comments / lead_activity / lead_transfers: piggyback on lead visibility (admins for now)
CREATE POLICY lead_comments_admin_all ON public.lead_comments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY lead_comments_visible ON public.lead_comments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id));

CREATE POLICY lead_activity_admin_all ON public.lead_activity FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY lead_activity_visible ON public.lead_activity FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id));

CREATE POLICY lead_transfers_admin_all ON public.lead_transfers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY lead_transfers_involved ON public.lead_transfers FOR ALL TO authenticated
  USING (auth.uid() IN (from_user_id, to_user_id))
  WITH CHECK (auth.uid() IN (from_user_id, to_user_id));

-- office_api_keys / affiliates / affiliate_api_keys / ip_whitelist / api_logs / contact_requests: admins only via app code
CREATE POLICY office_api_keys_admin ON public.office_api_keys FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY affiliates_admin ON public.affiliates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY affiliate_api_keys_admin ON public.affiliate_api_keys FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY ip_whitelist_admin ON public.ip_whitelist FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY api_logs_admin ON public.api_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY contact_requests_admin ON public.contact_requests FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Realtime for leads
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
