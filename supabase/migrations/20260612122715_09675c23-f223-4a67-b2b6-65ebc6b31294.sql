DROP TRIGGER IF EXISTS leads_propagate_converted_to_doc_requests ON public.leads;
DROP FUNCTION IF EXISTS public.doc_requests_mark_converted_on_lead();