
DO $$
DECLARE
  v_uid uuid := gen_random_uuid();
  v_office uuid := '5af668d7-546e-439a-a4dd-85b121cd3aaa';
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
    'maximiliandoebler@grouptk.demo', crypt('GroupTK!2026Demo', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name','Maximilian Doebler'),
    now(), now(), '', '', '', ''
  );

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', 'maximiliandoebler@grouptk.demo', 'email_verified', true),
    'email', v_uid::text, now(), now(), now());

  UPDATE public.profiles
    SET office_id = v_office, status = 'active', full_name = 'Maximilian Doebler'
    WHERE user_id = v_uid;

  INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'agent'::public.app_role)
    ON CONFLICT DO NOTHING;
END $$;
