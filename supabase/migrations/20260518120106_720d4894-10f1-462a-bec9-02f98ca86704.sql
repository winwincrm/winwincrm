UPDATE public.leads
SET office_id = NULL, assigned_user_id = NULL, assigned_at = NULL
WHERE id IN (
  SELECT lead_id FROM public.lead_folder_items
  WHERE folder_id = '9475d53d-ad13-479b-8e7a-f6deb22daf33'
)
AND (office_id IS NOT NULL OR assigned_user_id IS NOT NULL);