
DO $$
DECLARE
  v_office uuid := '5af668d7-546e-439a-a4dd-85b121cd3aaa';
  v_users jsonb := '[
    {"email":"oliviarowell@grouptk.demo","name":"Olivia Rowell"},
    {"email":"michellesylviarodrigues@grouptk.demo","name":"Michelle Sylvia Rodrigues"}
  ]'::jsonb;
  v_rec jsonb;
  v_id uuid;
BEGIN
  FOR v_rec IN SELECT * FROM jsonb_array_elements(v_users) LOOP
    v_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
      v_rec->>'email', crypt('GroupTK!2026Demo', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_rec->>'name'),
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_id, v_id::text,
      jsonb_build_object('sub', v_id::text, 'email', v_rec->>'email', 'email_verified', true),
      'email', now(), now(), now());
    UPDATE public.profiles SET full_name = v_rec->>'name', office_id = v_office, status='active', must_change_password=false WHERE user_id = v_id;
    INSERT INTO public.user_roles (user_id, role) VALUES (v_id, 'agent'::public.app_role) ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
