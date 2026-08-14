-- Bookkeeping (encrypted, PIN-gated)
CREATE TABLE public.bookkeeping_clients (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  office_id uuid NOT NULL,
  name_ciphertext text NOT NULL,
  name_iv text NOT NULL,
  name_tag text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX idx_bookkeeping_clients_office ON public.bookkeeping_clients(office_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookkeeping_clients TO authenticated;
GRANT ALL ON public.bookkeeping_clients TO service_role;

ALTER TABLE public.bookkeeping_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin only bookkeeping_clients"
  ON public.bookkeeping_clients FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.bookkeeping_deposits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  office_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.bookkeeping_clients(id) ON DELETE CASCADE,
  deposit_date date NOT NULL,
  amount_ciphertext text NOT NULL,
  amount_iv text NOT NULL,
  amount_tag text NOT NULL,
  note_ciphertext text,
  note_iv text,
  note_tag text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX idx_bookkeeping_deposits_office_date ON public.bookkeeping_deposits(office_id, deposit_date);
CREATE INDEX idx_bookkeeping_deposits_client ON public.bookkeeping_deposits(client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookkeeping_deposits TO authenticated;
GRANT ALL ON public.bookkeeping_deposits TO service_role;

ALTER TABLE public.bookkeeping_deposits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin only bookkeeping_deposits"
  ON public.bookkeeping_deposits FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));