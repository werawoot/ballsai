-- Sandbox only for SQL101. Never run on Staging or Production: it creates roles, schemas, tables
-- and rows. Production's shape and its policies on teams, payments and tournaments as read on
-- 21 Nov 2026 (hivedzrwrrcnjrlirhtv). In an empty local Postgres 16 or 17 database, run in order:
--   psql -d <db> -f sql/checks/101-sandbox-base.sql
--   psql -d <db> -f sql/checks/101-sandbox-test.sql      (before: 11 of 12 false)
--   psql -d <db> -f sql/101-teams-payments-rls-v1.sql
--   psql -d <db> -f sql/checks/101-sandbox-test.sql      (after: 12 of 12 true)
-- Rollback drill: sql/101-teams-payments-rls-down-production.sql brings the old set back.
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$; do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated; grant usage on schema public to anon, authenticated;
create table public.profiles (id uuid primary key, role text);
create function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;
create function public.is_organizer() returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.profiles where id = auth.uid() and role in ('organizer','admin')) $$;
create table public.tournaments (id uuid primary key default gen_random_uuid(), name text, status text not null default 'open', organizer_id uuid, fee numeric);
create table public.teams (id uuid primary key default gen_random_uuid(), name text, tournament_id uuid references public.tournaments, created_by uuid not null, status text not null default 'draft');
create table public.payments (id uuid primary key default gen_random_uuid(), team_id uuid, tournament_id uuid, user_id uuid, amount numeric, slip_url text, status text not null default 'pending');
create unique index payments_one_payment_per_team_idx on public.payments (team_id);
alter table public.tournaments enable row level security; alter table public.teams enable row level security; alter table public.payments enable row level security;
grant select, insert, update on public.tournaments, public.teams, public.payments to authenticated, anon;
-- Production's policies as read on 21 Nov 2026 (hivedzrwrrcnjrlirhtv).
create policy "Players can create teams" on public.teams for insert with check (auth.uid() = created_by);
create policy "Players can view own teams" on public.teams for select using (auth.uid() = created_by);
create policy "Organizers can update payment status" on public.payments for update using (exists (select 1 from tournaments where tournaments.id = payments.tournament_id and tournaments.organizer_id = auth.uid()));
create policy "Organizers can view payments for their tournaments" on public.payments for select using (exists (select 1 from tournaments where tournaments.id = payments.tournament_id and tournaments.organizer_id = auth.uid()));
create policy "Users can insert own payments" on public.payments for insert with check (user_id = auth.uid());
create policy "Users can view own payments" on public.payments for select using (user_id = auth.uid());
create policy "Anyone can view tournaments" on public.tournaments for select using (true);
create policy "Organizer can create tournaments" on public.tournaments for insert with check (auth.uid() = organizer_id);
create policy "Organizer can update own tournaments" on public.tournaments for update using (auth.uid() = organizer_id);
create policy "tournaments_insert_organizer" on public.tournaments for insert to authenticated with check ((organizer_id = (select auth.uid())) and ((status = 'draft') or (select public.is_organizer())));
create policy "tournaments_select_public" on public.tournaments for select to anon, authenticated using ((status <> 'draft') or (organizer_id = (select auth.uid())) or (select public.is_admin()));
-- People and rows.
insert into public.profiles values ('00000000-0000-4000-8000-0000000000a1','organizer'),('00000000-0000-4000-8000-0000000000c1','player'),('00000000-0000-4000-8000-0000000000c2','player'),('00000000-0000-4000-8000-0000000000ad','admin');
insert into public.tournaments (id, name, status, organizer_id, fee) values ('00000000-0000-4000-8000-0000000000f1','paid','open','00000000-0000-4000-8000-0000000000a1',500),('00000000-0000-4000-8000-0000000000f2','closed','closed','00000000-0000-4000-8000-0000000000a1',null),('00000000-0000-4000-8000-0000000000f3','hidden draft','draft','00000000-0000-4000-8000-0000000000a1',null);
insert into public.teams (id, name, tournament_id, created_by, status) values ('00000000-0000-4000-8000-0000000000e1','coach1 team','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c1','pending'),('00000000-0000-4000-8000-0000000000e2','coach2 team','00000000-0000-4000-8000-0000000000f1','00000000-0000-4000-8000-0000000000c2','pending');
