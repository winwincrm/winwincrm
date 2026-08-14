UPDATE public.leads
SET lead_kind = 'cold'
WHERE payload->>'import_batch' IN ('Fest.xlsx 2026-05-26', 'Kitap.xlsx 2026-05-26')
  AND office_id = '1aaf0a2b-0359-4528-a4d7-6def28fba3c3'::uuid;