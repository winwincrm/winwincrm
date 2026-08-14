DO $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_email text := 'robert.oberhauser@orangeskies.org';
  v_office uuid := '5af668d7-546e-439a-a4dd-85b121cd3aaa';
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
    v_email, crypt('Welcome2026!', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name','Robert Oberhauser'),
    now(), now(), '', '', '', ''
  );

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user_id,
          jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
          'email', v_email, now(), now(), now());

  INSERT INTO public.profiles (user_id, email, full_name, office_id, status, must_change_password)
  VALUES (v_user_id, v_email, 'Robert Oberhauser', v_office, 'active', true)
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    office_id = EXCLUDED.office_id,
    email = EXCLUDED.email,
    status = 'active';

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'agent'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;