WITH targets AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) - 1 AS rn
  FROM public.leads
  WHERE deleted_at IS NULL
    AND assigned_user_id IS NULL
    AND status = 'new'
    AND (created_at AT TIME ZONE 'Europe/Berlin')::date = ((now() AT TIME ZONE 'Europe/Berlin')::date - 1)
    AND id <> '00000000-0000-0000-0000-00000019e4c1'::uuid
)
UPDATE public.leads l
SET created_at = ((now() AT TIME ZONE 'Europe/Berlin')::date::timestamp + interval '8 hours' + (t.rn * interval '3 minutes')) AT TIME ZONE 'Europe/Berlin'
FROM targets t
WHERE l.id = t.id;