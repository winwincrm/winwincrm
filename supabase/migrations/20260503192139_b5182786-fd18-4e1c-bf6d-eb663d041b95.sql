-- Per-office Madara credentials (admin-only)
CREATE TABLE public.office_madara_credentials (
  office_id uuid PRIMARY KEY,
  api_key text NOT NULL,
  signing_secret text,
  endpoint_url text NOT NULL DEFAULT 'https://madaraos.crypxt.com/api/public/leads/ingest',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.office_madara_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin only madara creds"
  ON public.office_madara_credentials
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_office_madara_credentials_updated_at
  BEFORE UPDATE ON public.office_madara_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Lead sync state
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS madara_pushed_at timestamptz,
  ADD COLUMN IF NOT EXISTS madara_remote_id text,
  ADD COLUMN IF NOT EXISTS madara_last_error text;

-- Audit log
CREATE TABLE public.madara_push_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  office_id uuid,
  triggered_by uuid,
  trigger_kind text NOT NULL,
  http_status int,
  ok boolean NOT NULL,
  response jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.madara_push_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin only madara push log"
  ON public.madara_push_log
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_madara_push_log_lead ON public.madara_push_log(lead_id, created_at DESC);