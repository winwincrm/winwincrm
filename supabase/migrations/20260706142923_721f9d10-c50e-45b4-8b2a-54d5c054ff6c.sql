DO $$
DECLARE
  v_id uuid;
  v_email text := 'jasoncook@grouptk.demo';
  v_name text := 'Jason Cook';
  v_pw text := 'GroupTK!2026Demo';
  v_office uuid := '5af668d7-546e-439a-a4dd-85b121cd3aaa';
BEGIN
  SELECT id INTO v_id FROM auth.users WHERE email = v_email;
  IF v_id IS NULL THEN
    v_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change,
      email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
      v_email, crypt(v_pw, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_name),
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_id, jsonb_build_object('sub', v_id::text, 'email', v_email), 'email', v_id::text, now(), now(), now());
  END IF;
  UPDATE public.profiles
    SET full_name = v_name, status = 'active', must_change_password = false, office_id = v_office
    WHERE user_id = v_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (v_id, 'agent') ON CONFLICT DO NOTHING;
END $$;