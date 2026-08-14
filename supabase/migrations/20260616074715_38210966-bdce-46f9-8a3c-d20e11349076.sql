
-- 1) lead_status enum + apply to leads.status
CREATE TYPE public.lead_status AS ENUM (
  'new','contacted','callback',
  'no_answer_1','no_answer_2','no_answer_3',
  'try_again','not_available','wrong_number',
  'appointment','qualified','converted','rejected','lost'
);
ALTER TABLE public.leads ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.leads ALTER COLUMN status TYPE public.lead_status USING status::public.lead_status;
ALTER TABLE public.leads ALTER COLUMN status SET DEFAULT 'new';

-- 2) lead_comments: body -> comment
ALTER TABLE public.lead_comments RENAME COLUMN body TO comment;

-- 3) lead_activity: action -> activity_type; add field_name
ALTER TABLE public.lead_activity RENAME COLUMN action TO activity_type;
ALTER TABLE public.lead_activity ADD COLUMN field_name TEXT;

-- 4) leads: origin_office_id + transfer_count
ALTER TABLE public.leads ADD COLUMN origin_office_id UUID REFERENCES public.offices(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN transfer_count INTEGER NOT NULL DEFAULT 0;

-- 5) lead_transfers: replace with the shape the code expects
DROP TABLE public.lead_transfers;
CREATE TABLE public.lead_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  from_office_id UUID REFERENCES public.offices(id) ON DELETE SET NULL,
  to_office_id UUID REFERENCES public.offices(id) ON DELETE SET NULL,
  transferred_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  note TEXT,
  transferred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_transfers TO authenticated;
GRANT ALL ON public.lead_transfers TO service_role;
ALTER TABLE public.lead_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY lead_transfers_admin ON public.lead_transfers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 6) api_logs: ip -> ip_address, error -> error_message
ALTER TABLE public.api_logs RENAME COLUMN ip TO ip_address;
ALTER TABLE public.api_logs RENAME COLUMN error TO error_message;

-- 7) Lock down SECURITY DEFINER helpers so they can't be called by anon/authenticated directly.
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_ip_allowed(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_ip_allowed(TEXT) TO service_role;
