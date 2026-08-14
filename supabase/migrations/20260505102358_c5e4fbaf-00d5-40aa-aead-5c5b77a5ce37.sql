
WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM leads
  WHERE office_id = '45695eb5-e837-4958-bab1-467de7378988'
    AND platform IS NOT NULL
)
UPDATE leads l
SET assigned_user_id = CASE WHEN r.rn <= 75 THEN 'c03ac0e8-7cbc-4d5b-898a-562b4919e97b'::uuid
                            ELSE '9e0a659f-d2dd-4901-ac88-079d6de6461c'::uuid END
FROM ranked r
WHERE l.id = r.id;
