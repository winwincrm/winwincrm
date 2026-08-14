
WITH target AS (
  SELECT id, office_id
  FROM public.leads
  WHERE assigned_user_id = '0153d0b2-33a5-47df-9f9d-b0b0bf5f838c'
    AND status = 'no_answer_3'
    AND lead_kind = 'live'
    AND deleted_at IS NULL
),
upd AS (
  UPDATE public.leads l
     SET office_id = '1aaf0a2b-0359-4528-a4d7-6def28fba3c3',
         assigned_user_id = '8c181979-840f-44e8-b143-cb0c109526e8',
         is_in_house = true,
         hide_in_house_from_agents = true,
         origin_office_id = COALESCE(l.origin_office_id, 'a2d7b652-902d-4b5d-9665-54d83b528847'),
         origin_agent_id = COALESCE(l.origin_agent_id, '0153d0b2-33a5-47df-9f9d-b0b0bf5f838c'),
         origin_agent_name = COALESCE(l.origin_agent_name, 'Robert Norberg'),
         transfer_count = COALESCE(l.transfer_count, 0) + 1
   FROM target t
   WHERE l.id = t.id
   RETURNING l.id, t.office_id AS from_office_id
)
INSERT INTO public.lead_transfers (lead_id, from_office_id, to_office_id, transferred_by, note)
SELECT id, from_office_id, '1aaf0a2b-0359-4528-a4d7-6def28fba3c3', NULL,
       'Bulk reassign no_answer_3 from Robert Norberg'
FROM upd;
