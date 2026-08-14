-- Create Black Office and migrate 9K (87154ed9...) + RRB (45695eb5...) data to it
DO $$
DECLARE
  black_id uuid;
  old_9k uuid := '87154ed9-45d0-4be5-becd-9ec5a6bbb24c';
  old_rrb uuid := '45695eb5-e837-4958-bab1-467de7378988';
BEGIN
  INSERT INTO public.offices (name, status) VALUES ('Black Office', 'active') RETURNING id INTO black_id;

  UPDATE public.profiles SET office_id = black_id WHERE office_id IN (old_9k, old_rrb);
  UPDATE public.leads SET office_id = black_id WHERE office_id IN (old_9k, old_rrb);
  UPDATE public.leads SET origin_office_id = black_id WHERE origin_office_id IN (old_9k, old_rrb);
  UPDATE public.distribution_rules SET office_id = black_id WHERE office_id IN (old_9k, old_rrb);
  UPDATE public.document_requests SET office_id = black_id WHERE office_id IN (old_9k, old_rrb);
  UPDATE public.api_logs SET office_id = black_id WHERE office_id IN (old_9k, old_rrb);
  UPDATE public.office_api_keys SET office_id = black_id WHERE office_id IN (old_9k, old_rrb);
  UPDATE public.lead_transfers SET from_office_id = black_id WHERE from_office_id IN (old_9k, old_rrb);
  UPDATE public.lead_transfers SET to_office_id = black_id WHERE to_office_id IN (old_9k, old_rrb);
  UPDATE public.madara_weekly_archive SET office_id = black_id WHERE office_id IN (old_9k, old_rrb);

  RAISE NOTICE 'Black Office created: %', black_id;
END $$;