UPDATE auth.users
SET encrypted_password = crypt('Demo1234!', gen_salt('bf')),
    updated_at = now()
WHERE email LIKE '%@grouptk.demo';

UPDATE public.profiles
SET must_change_password = false
WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE '%@grouptk.demo');