INSERT INTO public.lead_comments (lead_id, user_id, comment, created_at)
SELECT lead_id, NULL::uuid, comment, created_at FROM (VALUES
-- 702 rows inserted via separate file
(NULL::uuid, NULL::text, NULL::timestamptz)
) AS t(lead_id, comment, created_at) WHERE FALSE;
-- placeholder; the real insert is below

INSERT INTO public.lead_comments (lead_id, user_id, comment, created_at) VALUES
('69538e8a-640a-42b4-a9ea-e6c6d65cc30e', NULL, 'na', '2026-04-30T15:31:13.615068+00:00'::timestamptz);