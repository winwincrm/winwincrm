CREATE OR REPLACE FUNCTION public.is_ip_allowed(_ip text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    CASE
      WHEN NOT EXISTS (SELECT 1 FROM public.ip_whitelist WHERE status = 'active') THEN true
      WHEN _ip IS NULL OR _ip = '' THEN false
      ELSE EXISTS (
        SELECT 1 FROM public.ip_whitelist
        WHERE status = 'active'
          AND (
            ip_address = _ip
            OR (
              ip_address ~ '^[0-9a-fA-F:.]+$'
              AND _ip ~ '^[0-9a-fA-F:.]+$'
              AND ip_address::inet = _ip::inet
            )
          )
      )
    END;
$function$;