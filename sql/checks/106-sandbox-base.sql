-- Sandbox only for SQL106. Never run on Staging or Production: it creates roles, schemas, tables
-- and rows. In an empty local Postgres 16 or 17 database, run in order:
--   psql -d <db> -f sql/checks/101-sandbox-base.sql
--   psql -d <db> -f sql/checks/106-sandbox-base.sql
--   psql -d <db> -f sql/checks/106-sandbox-test.sql      (before SQL106: 7 of 11 not true)
--   psql -d <db> -f sql/106-athlete-weight-private-v1.sql
--   psql -d <db> -f sql/checks/106-sandbox-test.sql      (after: 11 of 11 true)
-- The tables and helpers SQL106 reads, as both projects have them (sql/18, 21, 58, 75; read on
-- 26 Nov 2026): athlete_profiles with SELECT granted column by column, guardian_links,
-- team_members, team_staff, is_accepted_guardian_for, is_team_staff.
create table public.athlete_profiles (user_id uuid primary key, display_name text, is_public boolean not null default false, height_cm numeric, weight_kg numeric, birth_date date);
alter table public.athlete_profiles enable row level security;
create policy athlete_profiles_read on public.athlete_profiles for select using (is_public or user_id = auth.uid());
create policy athlete_profiles_own_update on public.athlete_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select (user_id, display_name, is_public, height_cm, weight_kg) on public.athlete_profiles to anon, authenticated;
grant update (display_name, height_cm, weight_kg, birth_date) on public.athlete_profiles to authenticated;
create table public.guardian_links (id uuid primary key default gen_random_uuid(), guardian_id uuid not null, athlete_id uuid not null, status text not null, consent_at timestamptz);
create table public.team_members (id uuid primary key default gen_random_uuid(), team_id uuid not null, athlete_id uuid not null, status text not null);
create table public.team_staff (id uuid primary key default gen_random_uuid(), team_id uuid not null, user_id uuid not null, status text not null);
create function public.is_accepted_guardian_for(p_athlete_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.guardian_links where athlete_id = p_athlete_id and guardian_id = (select auth.uid()) and status = 'accepted' and consent_at is not null);
$$;
create function public.is_team_staff(p_team_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.teams t where t.id = p_team_id and t.created_by = (select auth.uid()))
      or exists (select 1 from public.team_staff s where s.team_id = p_team_id and s.user_id = (select auth.uid()) and s.status = 'accepted');
$$;
-- People: athlete 0b (public, a minor, 47 kg), guardian 9a (accepted), guardian 9b (pending),
-- head coach c1 (team e1, athlete accepted), assistant 5a (accepted staff of e1), coach c2 (team
-- e2, athlete only invited), stranger 77, admin ad.
insert into public.profiles values ('00000000-0000-4000-8000-0000000000a1','organizer'),('00000000-0000-4000-8000-0000000000c1','player'),('00000000-0000-4000-8000-0000000000c2','player'),('00000000-0000-4000-8000-0000000000ad','admin') on conflict do nothing;
insert into public.tournaments (id, name, status, organizer_id) values ('00000000-0000-4000-8000-0000000000f1','paid','open','00000000-0000-4000-8000-0000000000a1') on conflict do nothing;
insert into public.teams (id, name, tournament_id, created_by, status) values
  ('00000000-0000-4000-8000-0000000006e1','coach1','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c1','pending'),
  ('00000000-0000-4000-8000-0000000006e2','coach2','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c2','pending');
insert into public.athlete_profiles values ('00000000-0000-4000-8000-00000000000b','Nong B', true, 150, 47, '2014-01-01');
insert into public.guardian_links (guardian_id, athlete_id, status, consent_at) values
  ('00000000-0000-4000-8000-00000000009a','00000000-0000-4000-8000-00000000000b','accepted', now()),
  ('00000000-0000-4000-8000-00000000009b','00000000-0000-4000-8000-00000000000b','pending', now());
insert into public.team_members (team_id, athlete_id, status) values
  ('00000000-0000-4000-8000-0000000006e1','00000000-0000-4000-8000-00000000000b','accepted'),
  ('00000000-0000-4000-8000-0000000006e2','00000000-0000-4000-8000-00000000000b','pending');
insert into public.team_staff (team_id, user_id, status) values ('00000000-0000-4000-8000-0000000006e1','00000000-0000-4000-8000-00000000005a','accepted');
