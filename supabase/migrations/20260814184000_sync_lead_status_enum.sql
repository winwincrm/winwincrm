ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'no_answer_4';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'no_answer_5';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'low_potential';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'high_potential';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'wrong_person';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'bad_number';

NOTIFY pgrst, 'reload schema';
