DO $$
DECLARE
  v_users jsonb := '[
    {"email":"mathiaskoch@grouptk.demo","name":"Mathias Koch"},
    {"email":"marvinisenov@grouptk.demo","name":"Marvin Isenov"}
  ]'::jsonb;
  u jsonb;
  v_id uuid;
  v_pw text := 'GroupTK!2026Demo';
BEGIN
  FOR u IN SELECT * FROM jsonb_array_elements(v_users) LOOP
    SELECT id INTO v_id FROM auth.users WHERE email = u->>'email';
    IF v_id IS NULL THEN
      v_id := gen_random_uuid();
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, email_change,
        email_change_token_new, recovery_token
      ) VALUES (
        '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
        u->>'email', crypt(v_pw, gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', u->>'name'),
        now(), now(), '', '', '', ''
      );
      INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
      VALUES (gen_random_uuid(), v_id, jsonb_build_object('sub', v_id::text, 'email', u->>'email'), 'email', v_id::text, now(), now(), now());
    END IF;
    UPDATE public.profiles SET full_name = u->>'name', status = 'active', must_change_password = false WHERE user_id = v_id;
    INSERT INTO public.user_roles (user_id, role) VALUES (v_id, 'agent') ON CONFLICT DO NOTHING;
  END LOOP;
END $$;