UPDATE public.leads
SET assigned_at = created_at
WHERE id IN (
  '274b7953-30b6-4132-8dd1-a790c10bf77c', -- Alfons Weis
  '8060796a-9d0c-40f8-bfde-308f5f32a0ab', -- Kilian Bundschuh
  '63ba3a82-fad3-4382-80c1-5c4624f56e04', -- Dieter Dürr
  '1c787ed0-9e12-464c-9c30-c6bca70c54b1', -- Andreas Lettner
  'aa6341e0-62b4-482b-9f92-c5c6ecc75661'  -- Michael Gerlich
);