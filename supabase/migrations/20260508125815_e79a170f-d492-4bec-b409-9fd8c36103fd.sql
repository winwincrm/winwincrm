
-- Status enum
CREATE TYPE public.doc_request_status AS ENUM ('pending', 'sent', 'converted', 'cancelled');

-- Table
CREATE TABLE public.document_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  office_id uuid,
  requested_by uuid,
  full_name text NOT NULL,
  email text,
  duration_months int NOT NULL CHECK (duration_months IN (3,6,12,24,36,48)),
  amount numeric,
  percentage numeric,
  status public.doc_request_status NOT NULL DEFAULT 'pending',
  admin_note text,
  sent_at timestamptz,
  sent_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_doc_req_office ON public.document_requests(office_id);
CREATE INDEX idx_doc_req_lead ON public.document_requests(lead_id);
CREATE INDEX idx_doc_req_status ON public.document_requests(status);
CREATE INDEX idx_doc_req_created ON public.document_requests(created_at DESC);

ALTER TABLE public.document_requests ENABLE ROW LEVEL SECURITY;

-- RLS
CREATE POLICY "Admin all doc requests"
ON public.document_requests FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Office reads office doc requests"
ON public.document_requests FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'office') AND office_id = public.get_user_office(auth.uid()));

CREATE POLICY "Office inserts office doc requests"
ON public.document_requests FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'office')
  AND office_id = public.get_user_office(auth.uid())
  AND requested_by = auth.uid()
);

CREATE POLICY "Agent reads own doc requests"
ON public.document_requests FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'agent')
  AND lead_id IN (SELECT id FROM public.leads WHERE assigned_user_id = auth.uid())
);

CREATE POLICY "Agent inserts doc requests on own leads"
ON public.document_requests FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'agent')
  AND requested_by = auth.uid()
  AND lead_id IN (SELECT id FROM public.leads WHERE assigned_user_id = auth.uid())
);

-- updated_at trigger
CREATE TRIGGER doc_requests_set_updated_at
BEFORE UPDATE ON public.document_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Broadcast trigger
CREATE OR REPLACE FUNCTION public.broadcast_doc_request_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
BEGIN
  rec := COALESCE(NEW, OLD);
  PERFORM realtime.send(
    jsonb_build_object(
      'op', TG_OP,
      'doc_request_id', rec.id,
      'office_id', rec.office_id,
      'lead_id', rec.lead_id,
      'status', rec.status,
      'new', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
      'old', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END
    ),
    'doc_request_change',
    'doc_requests:admin',
    true
  );
  RETURN rec;
END;
$$;

CREATE TRIGGER doc_requests_broadcast
AFTER INSERT OR UPDATE OR DELETE ON public.document_requests
FOR EACH ROW EXECUTE FUNCTION public.broadcast_doc_request_change();

-- Auto-mark converted when lead converts
CREATE OR REPLACE FUNCTION public.doc_requests_mark_converted_on_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'converted' AND OLD.status IS DISTINCT FROM 'converted' THEN
    UPDATE public.document_requests
       SET status = 'converted'
     WHERE lead_id = NEW.id
       AND status IN ('pending', 'sent');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER leads_propagate_converted_to_doc_requests
AFTER UPDATE OF status ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.doc_requests_mark_converted_on_lead();
