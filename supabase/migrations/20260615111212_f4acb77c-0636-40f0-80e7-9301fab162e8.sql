ALTER TABLE public.bookkeeping_log_entries
  ADD COLUMN office_id uuid REFERENCES public.offices(id) ON DELETE SET NULL,
  ADD COLUMN cashout boolean NOT NULL DEFAULT false;

CREATE INDEX bookkeeping_log_entries_office_idx ON public.bookkeeping_log_entries (office_id);