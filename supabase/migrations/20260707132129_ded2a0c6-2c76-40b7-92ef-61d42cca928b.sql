
DO $$
DECLARE
  v_office uuid := '5af668d7-546e-439a-a4dd-85b121cd3aaa';
  v_pw text := 'GroupTK!2026Demo';
  v_user jsonb;
  v_uid uuid;
  v_email text;
  v_name text;
BEGIN
  FOR v_user IN SELECT * FROM jsonb_array_elements('[
    {"email":"juliaweiss@grouptk.demo","name":"Julia Weiss"},
    {"email":"martinwuttenberg@grouptk.demo","name":"Martin Wuttenberg"},
    {"email":"kristineclark@grouptk.demo","name":"Kristine Clark"}
  ]'::jsonb)
  LOOP
    v_email := v_user->>'email';
    v_name := v_user->>'name';
    v_uid := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change,
      email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      v_email, crypt(v_pw, gen_salt('bf')), now(),
      jsonb_build_object('provider','email','providers',ARRAY['email']),
      jsonb_build_object('full_name', v_name),
      now(), now(), '', '', '', ''
    );

    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, created_at, updated_at, last_sign_in_at)
    VALUES (gen_random_uuid(), v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', v_email),
      'email', v_uid::text, now(), now(), now());

    UPDATE public.profiles
      SET full_name = v_name, status = 'active', office_id = v_office, must_change_password = false
      WHERE user_id = v_uid;

    INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'agent')
      ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
