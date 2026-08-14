-- Live in House category: second dimension on leads + admin-only transfer history
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS is_in_house boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS origin_office_id uuid NULL,
  ADD COLUMN IF NOT EXISTS transfer_count int NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_leads_in_house ON public.leads(office_id) WHERE is_in_house;

CREATE TABLE IF NOT EXISTS public.lead_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  from_office_id uuid NULL,
  to_office_id uuid NOT NULL,
  transferred_by uuid NULL,
  transferred_at timestamptz NOT NULL DEFAULT now(),
  note text NULL
);

CREATE INDEX IF NOT EXISTS idx_lead_transfers_lead ON public.lead_transfers(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_transfers_from ON public.lead_transfers(from_office_id);
CREATE INDEX IF NOT EXISTS idx_lead_transfers_to ON public.lead_transfers(to_office_id);

ALTER TABLE public.lead_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin only lead transfers"
  ON public.lead_transfers
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Viewer reads lead transfers"
  ON public.lead_transfers
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'viewer'::app_role));
