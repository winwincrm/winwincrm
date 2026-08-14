UPDATE public.leads SET madara_pushed_at = NULL, madara_remote_id = NULL, madara_last_error = NULL;
UPDATE public.app_settings SET value = 'false'::jsonb WHERE key = 'madara_push_paused';