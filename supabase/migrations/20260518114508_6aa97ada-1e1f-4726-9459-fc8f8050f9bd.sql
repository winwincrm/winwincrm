UPDATE public.leads
SET assigned_user_id = '9e0a659f-d2dd-4901-ac88-079d6de6461c'
WHERE assigned_user_id IS NULL
  AND office_id = '45695eb5-e837-4958-bab1-467de7378988'
  AND updated_at > now() - interval '24 hours';

UPDATE public.leads
SET assigned_user_id = '796e271e-b222-47ad-9533-726b9c9f9c89'
WHERE assigned_user_id IS NULL
  AND office_id = '87154ed9-45d0-4be5-becd-9ec5a6bbb24c'
  AND updated_at > now() - interval '24 hours';