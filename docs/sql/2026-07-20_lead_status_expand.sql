-- Run this in the Supabase SQL editor for the external project.
-- Expands lead_status enum with new options and renames wrong_number -> wrong_person.

ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'no_answer_4';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'no_answer_5';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'low_potential';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'high_potential';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'bad_number';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'lead_status' AND e.enumlabel = 'wrong_number'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'lead_status' AND e.enumlabel = 'wrong_person'
  ) THEN
    EXECUTE 'ALTER TYPE public.lead_status RENAME VALUE ''wrong_number'' TO ''wrong_person''';
  END IF;
END $$;
