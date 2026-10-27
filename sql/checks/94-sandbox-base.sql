-- Sandbox only for SQL94 (T52). Never run on Staging or Production: it creates roles,
-- schemas and tables. In an empty local Postgres 16 database, run in order:
--   psql -d <db> -f sql/checks/94-sandbox-base.sql
--   psql -d <db> -f sql/94-public-scout-athletes-v1.sql
--   psql -d <db> -f sql/checks/94-sandbox-test.sql
-- The base is a stub of what SQL94 reads: athlete_profiles with RLS and column grants,
-- player_ranks with its indexes, public_athlete_age and the SQL58 directory view.

do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated;
create table auth.users(id uuid primary key);
create table public.profiles(id uuid primary key, role text);
create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles where id = auth.uid() and role='admin') $$;
grant execute on function public.is_admin() to anon, authenticated;
create table public.athlete_profiles (
  user_id uuid primary key, display_name text not null default '', birth_date date, sport text not null default 'football',
  position text, province text, current_team text, profile_image_url text, guardian_consent_at timestamptz,
  is_public boolean not null default false, verification_level text not null default 'self',
  created_at timestamptz not null default now());
alter table public.athlete_profiles enable row level security;
create policy s on public.athlete_profiles for select to anon, authenticated using (is_public = true or user_id = (select auth.uid()) or (select public.is_admin()));
grant select (user_id, display_name, sport, position, province, current_team, profile_image_url, is_public, verification_level, created_at) on public.athlete_profiles to anon, authenticated;
create index athlete_profiles_directory_page_idx on public.athlete_profiles (sport, created_at desc, user_id) where is_public;
create table public.player_ranks(id uuid primary key default gen_random_uuid(), player_id uuid, player_name text, sport text, season text, pts int default 0, ovr int default 0);
create unique index player_ranks_player_sport_season_idx on public.player_ranks (player_id, sport, season) where player_id is not null;
create index player_ranks_public_ranking_idx on public.player_ranks (sport, season, pts desc);
alter table public.player_ranks enable row level security; create policy r on public.player_ranks for select using (true);
grant select on public.player_ranks to anon, authenticated;
create function public.public_athlete_age(p_user_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select date_part('year', age((now() at time zone 'Asia/Bangkok')::date, a.birth_date))::integer
  from public.athlete_profiles a
  where a.user_id = p_user_id and a.birth_date is not null
    and (a.is_public or a.user_id = (select auth.uid()) or (select public.is_admin()));
$$;
grant execute on function public.public_athlete_age(uuid) to anon, authenticated;
create view public.public_athlete_directory with (security_invoker = true) as
select a.user_id, a.display_name, public.public_athlete_age(a.user_id) as age,
  a.position, a.province, a.current_team, a.profile_image_url, a.verification_level, a.sport, a.created_at
from public.athlete_profiles a where a.is_public;
grant select on public.public_athlete_directory to anon, authenticated;
