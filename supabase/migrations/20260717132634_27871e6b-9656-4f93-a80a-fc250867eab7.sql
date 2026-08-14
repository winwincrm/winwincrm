
DO $$
DECLARE v_uid uuid; v_office uuid;
BEGIN
  SELECT id INTO v_office FROM public.offices WHERE name ILIKE '%tom keen%' LIMIT 1;
  v_uid := gen_random_uuid();
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data, is_super_admin
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
    'agent@gmail.com', crypt('12345678', gen_salt('bf')),
    now(), now(), now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Agent"}'::jsonb, false
  );
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), v_uid, jsonb_build_object('sub', v_uid::text, 'email', 'agent@gmail.com'), 'email', v_uid::text, now(), now(), now());
  UPDATE public.profiles SET full_name='Agent', office_id=v_office, must_change_password=false, status='active' WHERE user_id=v_uid;
  INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'agent') ON CONFLICT DO NOTHING;
END $$;
