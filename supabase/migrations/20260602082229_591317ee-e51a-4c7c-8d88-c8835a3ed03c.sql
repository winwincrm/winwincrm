UPDATE public.leads
SET office_id = NULL,
    assigned_user_id = NULL,
    assigned_at = NULL,
    status = 'new',
    is_in_house = false
WHERE id IN (
  SELECT id FROM public.leads
  WHERE source = 'affiliate'
  ORDER BY created_at DESC
  LIMIT 12
);