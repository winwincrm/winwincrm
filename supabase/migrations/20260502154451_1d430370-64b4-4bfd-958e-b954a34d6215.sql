INSERT INTO public.user_roles (user_id, role)
VALUES ('f111e3ba-6de3-480c-9e64-c2f00ee9583f', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;