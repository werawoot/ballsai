-- 98-tournament-roster-functions-v1.sql
-- Staging (vorpnkedpscsqhnrssrl) only. Not needed on Production (hivedzrwrrcnjrlirhtv), which
-- has all of it from sql/20 (read-only check, 16 Nov 2026: same source md5, same grants, both
-- triggers). Read the Project ID in Settings > General before the run. Run as postgres.
-- Precheck: sql/98-tournament-roster-functions-precheck.sql. Postcheck:
-- sql/98-tournament-roster-functions-postcheck.sql. Rollback: sql/98-tournament-roster-functions-down.sql.
--
-- Why (owner chose this on 16 Nov 2026, runbook row 98): Staging lacks the four functions and
-- two triggers of sql/20-tournament-roster-flow-v1.sql. The app calls the first two to register
-- a team in a tournament and to submit it, so that path cannot work on Staging. sql/20 itself
-- must not be applied there: ADR-010 forbids it on a database with the beta sql/24, which
-- Staging has (its invite_team_member is the beta one), and sql/20's first block drops "the
-- first teams check that mentions status", which on Staging could be teams_kind_check (sql/78).
-- What: only the missing parts, with the function bodies copied from sql/20 unchanged (the
-- self-check compares their md5 with Production's), and Production's grants (no PUBLIC, no
-- anon: Staging's default privileges would give anon execute). Nothing else: the teams status
-- constraint and default (already right on Staging), invite_team_member, register_team_safely
-- and teams_tournament_draft_idx (sql/81) are left as they are.
-- Stops, changing nothing, if a prerequisite is missing, if the teams status check does not
-- allow draft and pending, or if one of the four exists with a different body.

begin;

do $$
declare
  v_name text;
  v_md5 text;
  v_found text;
begin
  if to_regclass('public.teams') is null or to_regclass('public.tournaments') is null
     or to_regclass('public.team_members') is null or to_regclass('public.payments') is null
     or to_regclass('public.match_player_performances') is null or to_regclass('public.player_ranks') is null
     or to_regclass('public.profiles') is null or to_regprocedure('public.is_admin()') is null then
    raise exception 'SQL98 needs teams, tournaments, team_members, payments, match_player_performances, player_ranks, profiles and is_admin()';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.teams'::regclass and conname = 'teams_status_check'
      and pg_get_constraintdef(oid) like '%''draft''%' and pg_get_constraintdef(oid) like '%''pending''%'
  ) then
    raise exception 'SQL98: teams_status_check does not allow draft and pending';
  end if;
  for v_name, v_md5 in select * from (values
    ('create_tournament_team_safely', '0fe734aba21070e7a7a188b310ba4503'),
    ('submit_tournament_team_safely', '6cf8a5cdacf2357ac7307c771e18d5f5'),
    ('assert_match_performance_roster_member', 'ba43ed37a7fa6f627b31fa7a80b1f61a'),
    ('assert_payment_team_is_pending', '112c4dd54e79b40114f6f330918ab06a')
  ) as expected(name, md5) loop
    select md5(p.prosrc) into v_found from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_name;
    if v_found is not null and v_found <> v_md5 then
      raise exception 'SQL98: public.% exists with another body; review it by hand', v_name;
    end if;
  end loop;
end;
$$;

-- The four functions of sql/20, unchanged.
create or replace function public.create_tournament_team_safely(
  p_tournament_id uuid,
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_persona text;
  v_team_id uuid;
  v_tournament public.tournaments%rowtype;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 80 then
    raise exception 'INVALID_TEAM_NAME' using errcode = '22023';
  end if;

  select role, onboarding_persona into v_role, v_persona from public.profiles where id = v_user_id;
  if coalesce(v_role, '') not in ('organizer', 'admin')
    and coalesce(v_persona, '') <> 'coach_organizer' then
    raise exception 'COACH_ORGANIZER_REQUIRED' using errcode = '42501';
  end if;

  select * into v_tournament from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'TOURNAMENT_NOT_FOUND'; end if;
  if v_tournament.status <> 'open' then raise exception 'TOURNAMENT_CLOSED'; end if;
  if exists (select 1 from public.teams where tournament_id = p_tournament_id and created_by = v_user_id) then
    raise exception 'ALREADY_HAS_TEAM_FOR_TOURNAMENT' using errcode = '23505';
  end if;

  insert into public.teams (name, members, tournament_id, created_by, status)
  values (trim(p_name), '', p_tournament_id, v_user_id, 'draft')
  returning id into v_team_id;
  return v_team_id;
end;
$$;

revoke all on function public.create_tournament_team_safely(uuid, text) from public, anon;
grant execute on function public.create_tournament_team_safely(uuid, text) to authenticated, service_role;

create or replace function public.submit_tournament_team_safely(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_team public.teams%rowtype;
  v_tournament public.tournaments%rowtype;
  v_count integer;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_team from public.teams where id = p_team_id for update;
  if not found then raise exception 'TEAM_NOT_FOUND'; end if;
  select * into v_tournament from public.tournaments where id = v_team.tournament_id for update;
  if not (v_team.created_by = v_user_id or v_tournament.organizer_id = v_user_id or public.is_admin()) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_team.status <> 'draft' then raise exception 'TEAM_NOT_DRAFT'; end if;
  if v_tournament.status <> 'open' then raise exception 'TOURNAMENT_CLOSED'; end if;
  if not exists (select 1 from public.team_members where team_id = v_team.id and status = 'accepted') then
    raise exception 'ACCEPTED_ROSTER_REQUIRED';
  end if;
  if v_tournament.max_teams is not null then
    select count(*) into v_count from public.teams
      where tournament_id = v_tournament.id and status in ('pending', 'confirmed');
    if v_count >= v_tournament.max_teams then raise exception 'TOURNAMENT_FULL'; end if;
  end if;
  update public.teams set status = 'pending' where id = v_team.id;
end;
$$;

revoke all on function public.submit_tournament_team_safely(uuid) from public, anon;
grant execute on function public.submit_tournament_team_safely(uuid) to authenticated, service_role;

create or replace function public.assert_match_performance_roster_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_player_id uuid;
begin
  select player_id into v_player_id from public.player_ranks where id = new.player_rank_id;
  if v_player_id is null or not exists (
    select 1 from public.team_members
    where team_id = new.team_id and athlete_id = v_player_id and status = 'accepted'
  ) then
    raise exception 'PLAYER_NOT_ACCEPTED_ON_TEAM_ROSTER' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.assert_match_performance_roster_member() from public, anon;
grant execute on function public.assert_match_performance_roster_member() to authenticated, service_role;

drop trigger if exists match_performance_roster_guard on public.match_player_performances;
create trigger match_performance_roster_guard
before insert on public.match_player_performances
for each row execute function public.assert_match_performance_roster_member();

create or replace function public.assert_payment_team_is_pending()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.teams
    where id = new.team_id and status = 'pending'
  ) then
    raise exception 'TEAM_NOT_READY_FOR_PAYMENT' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.assert_payment_team_is_pending() from public, anon;
grant execute on function public.assert_payment_team_is_pending() to authenticated, service_role;

drop trigger if exists payment_team_pending_guard on public.payments;
create trigger payment_team_pending_guard
before insert on public.payments
for each row execute function public.assert_payment_team_is_pending();

do $$
begin
  if (select count(1) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef and (p.proname, md5(p.prosrc)) in (
    ('create_tournament_team_safely', '0fe734aba21070e7a7a188b310ba4503'),
    ('submit_tournament_team_safely', '6cf8a5cdacf2357ac7307c771e18d5f5'),
    ('assert_match_performance_roster_member', 'ba43ed37a7fa6f627b31fa7a80b1f61a'),
    ('assert_payment_team_is_pending', '112c4dd54e79b40114f6f330918ab06a')
      )) <> 4
     or has_function_privilege('anon', 'public.create_tournament_team_safely(uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.submit_tournament_team_safely(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.create_tournament_team_safely(uuid,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.submit_tournament_team_safely(uuid)', 'execute')
     or (select count(1) from pg_trigger where not tgisinternal and tgenabled = 'O' and (tgrelid, tgname) in (
           ('public.match_player_performances'::regclass, 'match_performance_roster_guard'),
           ('public.payments'::regclass, 'payment_team_pending_guard'))) <> 2 then
    raise exception 'SQL98 self-check failed';
  end if;
end;
$$;

commit;
