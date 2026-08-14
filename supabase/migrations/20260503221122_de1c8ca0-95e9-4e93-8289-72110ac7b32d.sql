
-- KS: delete 14 within-office duplicate rows (chosen to keep agents balanced)
DELETE FROM public.leads WHERE id IN (
  'baaaadce-b1f5-4dc7-a1ce-5d049fae43a5', -- Josef Labo (d2)
  '7fe16593-9d1f-4272-82ee-9ca055662106', -- Hönes (d2)
  'c7d7bd45-e7d1-4e12-a61f-c4e09db0b2bb', -- Staudinger (d2)
  '9c19a8f7-7538-4cf3-95bb-a0942553eebc', -- Stremmel (7c)
  '20a44740-63b5-4aee-b261-44c742cc4c38', -- Mueller (7c)
  'b3c3d39f-ffed-4e15-bb0e-b4a3e0b5109d', -- Klein (7c)
  '179905f3-4632-4255-ab61-91b6427dbd7d', -- Latten (17)
  'fd8459e1-5155-4767-a6ce-7726d78514a5', -- Lutter (17)
  '37fbe189-f9b5-4f97-9a7e-f465db3fe465', -- Henke (17)
  '9c129dac-2a5c-40d7-8242-70cadaad55f8', -- Simon (0e)
  'c816f2df-6868-4da6-846b-7d3fc172410d', -- Enaux (0e)
  '565cf8f0-a27e-4991-9c08-cbb5cb7bdfa1', -- Rohrmüller (0e)
  'f7f658c3-7228-4b29-97f2-eff192cc4642', -- Schröder (3b)
  '959eb509-7229-42eb-b0d3-46e87d960992'  -- Freytag (3b)
);

-- KS: set ALL remaining leads to 'new'
UPDATE public.leads
SET status = 'new'
WHERE office_id = (SELECT id FROM public.offices WHERE name ILIKE 'KS%')
  AND status <> 'new';

-- 9K merges: rename kept rows, delete duplicates
UPDATE public.leads SET full_name = 'Monika Lehmann / Jürgen Sauer'
  WHERE id = 'd7684550-1f32-41a7-baad-48079eccedb5';
UPDATE public.leads SET full_name = 'Manfred Steeg / Bernhard Geers'
  WHERE id = 'cfe410ea-207c-47c5-91b9-b0a255ac9474';

DELETE FROM public.leads WHERE id IN (
  'f90fb41c-4ceb-417b-bd15-62f8f7cd8453', -- Jürgen Sauer dup
  '89f935a9-b095-42ed-a67c-267083e07755', -- Bernhard Geers dup
  '873718a1-f046-4012-b97b-9df031ff6708', -- Hans Leipold dup
  'dbd6f7eb-9a14-4c63-bc3c-1bfd248304aa'  -- Ralf Julian Koch dup (keep Julian Ralf Koch)
);

-- DB office: delete the placeholder "Unknown N" rows; keep the named warm leads.
-- For Karl-Heinz Uhlig pair (no Unknown): delete one duplicate.
DELETE FROM public.leads WHERE id IN (
  'fcf8833c-ea3e-453a-8fbf-83716cf55927', -- Unknown 7  (keep Christine Fischer)
  'af9c4af7-ab38-4cdd-bd6c-3b8a73917835', -- Unknown 12 (keep Hermann Schmidt)
  '5105084a-9a48-4b3f-bcf3-687c91165cd9', -- Unknown 1  (keep converted Wolfgang Köhler)
  '6dde67a6-3c94-4774-bc58-a15c8b1860ba', -- Unknown 19 (keep Thomas Langguth)
  'ff3ad4aa-4af2-4f47-9558-ca004469acb1', -- Unknown 2  (keep Thomas Witt)
  '6e180b63-da9b-4ffa-86fb-fdd1c3080fd3', -- Unknown 8  (keep Richard Tontsch)
  '56d3ea58-69af-4d69-8430-8f470a657b68'  -- Karl-Heinz Uhlig dup
);
