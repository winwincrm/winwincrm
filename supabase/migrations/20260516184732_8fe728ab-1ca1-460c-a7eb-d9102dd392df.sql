
-- Affiliates and per-affiliate API keys for the public ingest API.
CREATE TABLE public.affiliates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status public.user_status NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin only affiliates" ON public.affiliates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Viewer reads affiliates" ON public.affiliates FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'viewer'));
CREATE TRIGGER affiliates_set_updated_at BEFORE UPDATE ON public.affiliates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.affiliate_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  key_hash text NOT NULL UNIQUE,
  label text,
  status public.user_status NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
ALTER TABLE public.affiliate_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin only affiliate api keys" ON public.affiliate_api_keys FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Viewer reads affiliate api keys" ON public.affiliate_api_keys FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'viewer'));

CREATE INDEX idx_affiliate_api_keys_affiliate ON public.affiliate_api_keys(affiliate_id);

-- Index to find inbox leads quickly (office_id IS NULL + source='affiliate').
CREATE INDEX IF NOT EXISTS idx_leads_inbox
  ON public.leads(created_at DESC)
  WHERE office_id IS NULL AND source = 'affiliate';
