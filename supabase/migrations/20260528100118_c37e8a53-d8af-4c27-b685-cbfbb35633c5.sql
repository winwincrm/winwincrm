
-- Add origin agent tracking to leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS origin_agent_id uuid,
  ADD COLUMN IF NOT EXISTS origin_agent_name text;

CREATE INDEX IF NOT EXISTS leads_origin_agent_id_idx
  ON public.leads(origin_agent_id)
  WHERE origin_agent_id IS NOT NULL;

-- Backfill: transfer Alex Cliff's 23 live no_answer_1 leads to Tobias Herb / Helfenstein Office
WITH target_leads AS (
  SELECT id, office_id, transfer_count
  FROM public.leads
  WHERE assigned_user_id = '9e0a659f-d2dd-4901-ac88-079d6de6461c'
    AND status = 'no_answer_1'
    AND lead_kind = 'live'
    AND deleted_at IS NULL
),
transfer_inserts AS (
  INSERT INTO public.lead_transfers (lead_id, from_office_id, to_office_id, transferred_by, note)
  SELECT id,
         office_id,
         '1aaf0a2b-0359-4528-a4d7-6def28fba3c3'::uuid,
         NULL,
         'Bulk reassign no_answer_1 from Alex Cliff'
  FROM target_leads
  RETURNING lead_id
)
UPDATE public.leads l
SET origin_office_id = COALESCE(l.origin_office_id, l.office_id),
    origin_agent_id = '9e0a659f-d2dd-4901-ac88-079d6de6461c',
    origin_agent_name = 'Alex Cliff',
    office_id = '1aaf0a2b-0359-4528-a4d7-6def28fba3c3',
    assigned_user_id = '8c181979-840f-44e8-b143-cb0c109526e8',
    is_in_house = true,
    hide_in_house_from_agents = true,
    transfer_count = COALESCE(l.transfer_count, 0) + 1
FROM target_leads t
WHERE l.id = t.id;
