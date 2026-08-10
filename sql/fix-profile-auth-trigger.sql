-- Repair profile creation for Supabase Auth users.
-- Safe to run more than once in the Supabase SQL editor.

begin;

alter table public.profiles
add column if not exists updated_at timestamptz not null default now();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    role,
    updated_at
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'user',
    now()
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Recover accounts that were created before the trigger was repaired.
insert into public.profiles (
  id,
  email,
  full_name,
  role,
  updated_at
)
select
  users.id,
  users.email,
  coalesce(users.raw_user_meta_data ->> 'full_name', ''),
  'user',
  now()
from auth.users as users
left join public.profiles as profiles on profiles.id = users.id
where profiles.id is null
on conflict (id) do nothing;

drop policy if exists "profiles_select_own_admin_organizer" on public.profiles;
create policy "profiles_select_own_admin_organizer"
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or (select public.is_admin())
  or exists (
    select 1
    from public.teams t
    join public.tournaments tr on tr.id = t.tournament_id
    where t.created_by = profiles.id
      and tr.organizer_id = (select auth.uid())
  )
);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (id = (select auth.uid()));

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
on public.profiles
for update
to authenticated
using (
  id = (select auth.uid())
  or (select public.is_admin())
)
with check (
  id = (select auth.uid())
  or (select public.is_admin())
);

commit;
