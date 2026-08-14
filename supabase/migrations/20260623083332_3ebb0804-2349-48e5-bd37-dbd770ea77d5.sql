DO $$
DECLARE
  v_user_id uuid;
  v_office_id uuid := '5af668d7-546e-439a-a4dd-85b121cd3aaa';
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'robertscanlan@grouptk.demo';

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
      'robertscanlan@grouptk.demo', crypt('GroupTK!2026Demo', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name','Robert Scanlan'),
      now(), now(), '', '', '', ''
    );

    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', 'robertscanlan@grouptk.demo', 'email_verified', true),
      'email', v_user_id::text, now(), now(), now());
  END IF;

  INSERT INTO public.profiles (user_id, email, full_name, office_id, status)
  VALUES (v_user_id, 'robertscanlan@grouptk.demo', 'Robert Scanlan', v_office_id, 'active')
  ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name, office_id = EXCLUDED.office_id, status = 'active';

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'agent'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;