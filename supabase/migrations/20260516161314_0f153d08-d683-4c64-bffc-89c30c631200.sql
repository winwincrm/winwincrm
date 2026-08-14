CREATE OR REPLACE FUNCTION public.compute_lead_kind(_full_name text, _first_name text, _last_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  candidate text;
BEGIN
  candidate := COALESCE(NULLIF(btrim(_full_name), ''), NULLIF(btrim(
    COALESCE(NULLIF(_first_name, ''), '') || ' ' ||
    COALESCE(NULLIF(_last_name, ''), '')
  ), ''));

  IF candidate IS NULL OR btrim(candidate) = '' THEN
    RETURN 'cold';
  END IF;

  IF lower(btrim(candidate)) = 'unknown' THEN
    RETURN 'cold';
  END IF;

  IF candidate !~ '[A-Za-zÀ-ÿ]' THEN
    RETURN 'cold';
  END IF;

  RETURN 'live';
END;
$$;

ALTER TABLE public.leads DROP COLUMN lead_kind;

ALTER TABLE public.leads
  ADD COLUMN lead_kind text
  GENERATED ALWAYS AS (public.compute_lead_kind(full_name, first_name, last_name)) STORED;