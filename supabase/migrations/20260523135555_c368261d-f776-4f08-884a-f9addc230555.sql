do $$ begin
  create type public.contact_request_status as enum ('new','seen','handled','dismissed');
exception when duplicate_object then null; end $$;

create table if not exists public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  name text not null,
  phone text not null,
  email text,
  preferred_time text,
  topic text,
  message text,
  source text,
  status public.contact_request_status not null default 'new',
  handled_by uuid references auth.users(id) on delete set null,
  handled_at timestamptz,
  ip text,
  user_agent text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contact_requests_office_created
  on public.contact_requests (office_id, created_at desc);
create index if not exists idx_contact_requests_status_new
  on public.contact_requests (office_id, created_at desc) where status = 'new';

alter table public.contact_requests enable row level security;

create policy "contact_requests admin all"
  on public.contact_requests for all
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy "contact_requests office read"
  on public.contact_requests for select
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.office_id = contact_requests.office_id
    )
  );

create policy "contact_requests office update"
  on public.contact_requests for update
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.office_id = contact_requests.office_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.office_id = contact_requests.office_id
    )
  );

create trigger contact_requests_set_updated_at
  before update on public.contact_requests
  for each row execute function public.set_updated_at();
