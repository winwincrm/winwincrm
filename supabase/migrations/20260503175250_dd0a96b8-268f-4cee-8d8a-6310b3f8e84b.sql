WITH ranked AS (
  SELECT id, ((ROW_NUMBER() OVER (ORDER BY created_at, id)) - 1) % 5 AS bucket
  FROM public.leads
  WHERE status = 'rejected'
    AND platform IS NOT NULL
    AND platform <> 'unknown'
)
UPDATE public.leads l
SET office_id = '4cb70020-cabf-4ab6-bc06-58f55e7e0220',
    assigned_user_id = CASE r.bucket
      WHEN 0 THEN 'd2faa442-621b-45f0-ae6c-9a06661e93d6'::uuid
      WHEN 1 THEN '7c4495b0-0daf-41a2-9fb2-f29dbe491020'::uuid
      WHEN 2 THEN '3bea1094-08ee-43ca-b2dd-7df5033213fa'::uuid
      WHEN 3 THEN '17fcabe4-d864-47f6-bfe3-19c8de84d285'::uuid
      WHEN 4 THEN '0ec1a715-1a65-4b2f-ba3a-32a42e9a5936'::uuid
    END
FROM ranked r
WHERE l.id = r.id;