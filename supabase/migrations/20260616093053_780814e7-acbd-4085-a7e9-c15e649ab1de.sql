
DO $$
DECLARE
  v_office_id uuid := '5af668d7-546e-439a-a4dd-85b121cd3aaa';
  v_password text := 'Welcome123!';
  v_enc text := crypt(v_password, gen_salt('bf'));
  v_user record;
  v_uid uuid;
  v_users jsonb := '[
    {"email":"ana.taylor@tomkeen.crm","name":"Ana Taylor","role":"supervisor"},
    {"email":"nikos.pappas@tomkeen.crm","name":"Nikos Pappas","role":"supervisor"}
  ]'::jsonb;
  i int;
BEGIN
  -- supervisors
  FOR v_user IN SELECT * FROM jsonb_to_recordset(v_users) AS x(email text, name text, role text) LOOP
    v_uid := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_user.email, v_enc,
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_user.name),
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', v_user.email, 'email_verified', true),
      'email', v_uid::text, now(), now(), now());
    UPDATE public.profiles SET office_id = v_office_id, full_name = v_user.name WHERE user_id = v_uid;
    INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, v_user.role::app_role);
  END LOOP;

  -- 25 agents
  FOR i IN 1..25 LOOP
    v_uid := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      'user' || i || '@tomkeen.crm', v_enc, now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', 'User ' || i),
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', 'user' || i || '@tomkeen.crm', 'email_verified', true),
      'email', v_uid::text, now(), now(), now());
    UPDATE public.profiles SET office_id = v_office_id, full_name = 'User ' || i WHERE user_id = v_uid;
    INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'agent'::app_role);
  END LOOP;
END $$;
