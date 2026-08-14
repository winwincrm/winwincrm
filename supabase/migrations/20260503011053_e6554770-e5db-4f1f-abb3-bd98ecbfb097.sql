INSERT INTO public.offices (name)
SELECT 'DB Office'
WHERE NOT EXISTS (SELECT 1 FROM public.offices WHERE name = 'DB Office');

INSERT INTO public.offices (name)
SELECT '9K Office'
WHERE NOT EXISTS (SELECT 1 FROM public.offices WHERE name = '9K Office');