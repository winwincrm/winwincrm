
-- Unlink bookkeeping_log_entries from offices table: replace office_id FK with a plain text label.
ALTER TABLE public.bookkeeping_log_entries ADD COLUMN IF NOT EXISTS office_label text;

UPDATE public.bookkeeping_log_entries b
SET office_label = o.name
FROM public.offices o
WHERE b.office_id = o.id AND b.office_label IS NULL;

ALTER TABLE public.bookkeeping_log_entries DROP COLUMN IF EXISTS office_id;
