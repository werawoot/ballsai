-- BALLSAI Supabase RLS with private slips storage
-- Use this version if you want payment slips to stay private.
-- IMPORTANT: if you apply this file, update the app to use signed URLs
-- instead of getPublicUrl() for bucket "slips".

begin;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.is_organizer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('organizer', 'admin')
  );
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_organizer() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;
grant execute on function public.is_organizer() to anon, authenticated, service_role;

alter table public.profiles enable row level security;
alter table public.tournaments enable row level security;
alter table public.player_ranks enable row level security;
alter table public.teams enable row level security;
alter table public.payments enable row level security;

drop policy if exists "profiles_select_own_admin_organizer" on public.profiles;
create policy "profiles_select_own_admin_organizer"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.is_admin()
  or exists (
    select 1
    from public.teams t
    join public.tournaments tr on tr.id = t.tournament_id
    where t.created_by = profiles.id
      and tr.organizer_id = auth.uid()
  )
);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
on public.profiles
for update
to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

drop policy if exists "tournaments_select_public" on public.tournaments;
create policy "tournaments_select_public"
on public.tournaments
for select
to anon, authenticated
using (true);

drop policy if exists "tournaments_insert_organizer" on public.tournaments;
create policy "tournaments_insert_organizer"
on public.tournaments
for insert
to authenticated
with check (
  public.is_organizer()
  and organizer_id = auth.uid()
);

drop policy if exists "tournaments_update_owner_or_admin" on public.tournaments;
create policy "tournaments_update_owner_or_admin"
on public.tournaments
for update
to authenticated
using (
  organizer_id = auth.uid()
  or public.is_admin()
)
with check (
  organizer_id = auth.uid()
  or public.is_admin()
);

drop policy if exists "player_ranks_select_public" on public.player_ranks;
create policy "player_ranks_select_public"
on public.player_ranks
for select
to anon, authenticated
using (true);

drop policy if exists "player_ranks_admin_insert" on public.player_ranks;
create policy "player_ranks_admin_insert"
on public.player_ranks
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "player_ranks_admin_update" on public.player_ranks;
create policy "player_ranks_admin_update"
on public.player_ranks
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "player_ranks_admin_delete" on public.player_ranks;
create policy "player_ranks_admin_delete"
on public.player_ranks
for delete
to authenticated
using (public.is_admin());

drop policy if exists "teams_select_owner_organizer_admin" on public.teams;
create policy "teams_select_owner_organizer_admin"
on public.teams
for select
to authenticated
using (
  created_by = auth.uid()
  or public.is_admin()
  or exists (
    select 1
    from public.tournaments tr
    where tr.id = teams.tournament_id
      and tr.organizer_id = auth.uid()
  )
);

drop policy if exists "teams_insert_creator_for_open_tournament" on public.teams;
create policy "teams_insert_creator_for_open_tournament"
on public.teams
for insert
to authenticated
with check (
  created_by = auth.uid()
  and status = 'pending'
  and exists (
    select 1
    from public.tournaments tr
    where tr.id = teams.tournament_id
      and tr.status = 'open'
  )
);

drop policy if exists "teams_update_organizer_admin" on public.teams;
create policy "teams_update_organizer_admin"
on public.teams
for update
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.tournaments tr
    where tr.id = teams.tournament_id
      and tr.organizer_id = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1
    from public.tournaments tr
    where tr.id = teams.tournament_id
      and tr.organizer_id = auth.uid()
  )
);

drop policy if exists "payments_select_owner_organizer_admin" on public.payments;
create policy "payments_select_owner_organizer_admin"
on public.payments
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin()
  or exists (
    select 1
    from public.tournaments tr
    where tr.id = payments.tournament_id
      and tr.organizer_id = auth.uid()
  )
);

drop policy if exists "payments_insert_owner_for_own_team" on public.payments;
create policy "payments_insert_owner_for_own_team"
on public.payments
for insert
to authenticated
with check (
  user_id = auth.uid()
  and status = 'pending'
  and exists (
    select 1
    from public.teams t
    join public.tournaments tr on tr.id = t.tournament_id
    where t.id = payments.team_id
      and t.created_by = auth.uid()
      and tr.status = 'open'
      and t.tournament_id = payments.tournament_id
  )
);

drop policy if exists "payments_update_organizer_admin" on public.payments;
create policy "payments_update_organizer_admin"
on public.payments
for update
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.tournaments tr
    where tr.id = payments.tournament_id
      and tr.organizer_id = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1
    from public.tournaments tr
    where tr.id = payments.tournament_id
      and tr.organizer_id = auth.uid()
  )
);

create unique index if not exists teams_one_registration_per_user_per_tournament_idx
  on public.teams (tournament_id, created_by);

create unique index if not exists payments_one_payment_per_team_idx
  on public.payments (team_id);

create index if not exists teams_tournament_id_idx
  on public.teams (tournament_id);

create index if not exists payments_tournament_id_idx
  on public.payments (tournament_id);

create index if not exists tournaments_organizer_id_idx
  on public.tournaments (organizer_id);

alter table storage.objects enable row level security;

drop policy if exists "slips_read_owner_organizer_admin" on storage.objects;
create policy "slips_read_owner_organizer_admin"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'slips'
  and (
    split_part(name, '_', 1) = auth.uid()::text
    or public.is_admin()
    or exists (
      select 1
      from public.payments p
      join public.tournaments tr on tr.id = p.tournament_id
      where p.slip_url like '%' || storage.objects.name
        and tr.organizer_id = auth.uid()
    )
  )
);

drop policy if exists "slips_owner_insert" on storage.objects;
create policy "slips_owner_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'slips'
  and split_part(name, '_', 1) = auth.uid()::text
);

drop policy if exists "slips_owner_delete" on storage.objects;
create policy "slips_owner_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'slips'
  and (
    split_part(name, '_', 1) = auth.uid()::text
    or public.is_admin()
  )
);

commit;
