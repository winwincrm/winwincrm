CREATE TABLE public.bookkeeping_log_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_month text NOT NULL,
  client_name_ciphertext text NOT NULL,
  client_name_iv text NOT NULL,
  client_name_tag text NOT NULL,
  amount_ciphertext text NOT NULL,
  amount_iv text NOT NULL,
  amount_tag text NOT NULL,
  kyc boolean NOT NULL DEFAULT false,
  verification boolean NOT NULL DEFAULT false,
  sent boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookkeeping_log_month_fmt CHECK (entry_month ~ '^[0-9]{4}-[0-9]{2}$'),
  CONSTRAINT bookkeeping_log_verif_requires_kyc CHECK (verification = false OR kyc = true)
);

CREATE INDEX bookkeeping_log_entries_month_idx ON public.bookkeeping_log_entries (entry_month);

GRANT ALL ON public.bookkeeping_log_entries TO service_role;

ALTER TABLE public.bookkeeping_log_entries ENABLE ROW LEVEL SECURITY;

-- No client-side policies: all access goes through server functions using the service role + PIN unlock token.

CREATE TRIGGER bookkeeping_log_entries_set_updated_at
  BEFORE UPDATE ON public.bookkeeping_log_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();