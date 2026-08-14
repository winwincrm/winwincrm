DROP TRIGGER IF EXISTS trg_leads_log_changes ON public.leads;
DROP TRIGGER IF EXISTS trg_leads_log_insert ON public.leads;
DROP TRIGGER IF EXISTS trg_leads_log_update ON public.leads;

CREATE TRIGGER trg_leads_log_insert
AFTER INSERT ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.log_lead_changes();

CREATE TRIGGER trg_leads_log_update
BEFORE UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.log_lead_changes();