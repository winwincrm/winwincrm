WITH rrb AS (
  SELECT id FROM public.leads WHERE office_id='45695eb5-e837-4958-bab1-467de7378988'
),
last_assign AS (
  SELECT DISTINCT ON (la.lead_id) la.lead_id, la.new_value::uuid AS agent
  FROM public.lead_activity la
  JOIN rrb ON rrb.id = la.lead_id
  WHERE la.activity_type='agent_changed' AND la.new_value <> '(none)'
  ORDER BY la.lead_id, la.created_at DESC
)
UPDATE public.leads l
SET assigned_user_id = la.agent
FROM last_assign la
WHERE l.id = la.lead_id
  AND l.assigned_user_id IS DISTINCT FROM la.agent;