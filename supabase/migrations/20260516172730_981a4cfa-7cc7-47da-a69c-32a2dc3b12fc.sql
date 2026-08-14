BEGIN;
DELETE FROM public.lead_folder_items WHERE lead_id IN (SELECT id FROM public.leads WHERE full_name LIKE 'TEST — %');
DELETE FROM public.lead_comments     WHERE lead_id IN (SELECT id FROM public.leads WHERE full_name LIKE 'TEST — %');
DELETE FROM public.lead_activity     WHERE lead_id IN (SELECT id FROM public.leads WHERE full_name LIKE 'TEST — %');
DELETE FROM public.document_requests WHERE lead_id IN (SELECT id FROM public.leads WHERE full_name LIKE 'TEST — %');
DELETE FROM public.leads             WHERE full_name LIKE 'TEST — %';
DELETE FROM public.lead_folders      WHERE name = 'TEST Folder';
DELETE FROM public.api_logs          WHERE payload::text LIKE '%TEST — %' OR payload->>'_test' = 'true';
COMMIT;