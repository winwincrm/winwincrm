ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS hide_in_house_from_agents boolean NOT NULL DEFAULT false;

UPDATE public.leads
SET is_in_house = true,
    origin_office_id = COALESCE(origin_office_id, office_id),
    hide_in_house_from_agents = true
WHERE office_id = '4cb70020-cabf-4ab6-bc06-58f55e7e0220'
  AND lead_kind = 'live'
  AND is_in_house = false
  AND assigned_at IS NOT NULL
  AND assigned_at < '2026-05-08 00:00:00+00';