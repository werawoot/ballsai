-- BallDoenSai.com Team Discovery V1
-- Apply after sql/24-team-roster-integrity-v1.sql. Additive: two read-only functions
-- plus a hardened replacement of request_team_membership(). No table, column, policy
-- or trigger is changed.
--
-- Why this exists: `teams` SELECT is restricted to the team's creator, the tournament
-- organizer and admins (sql/supabase-rls.sql). That is the correct default — a team's
-- roster, payment state and owner are not public. But it leaves an athlete unable to
-- (a) see which team invited them, or (b) find a team to ask to join, so the roster
-- lifecycle from step 24 has no athlete-facing entry point.
--
-- These functions are the narrowest fix: security definer, read-only, returning only
-- a team's id and display name plus its tournament's name. They never return
-- created_by, members, status detail, payment or contact data, and neither one lets a
-- caller enumerate anything they could not already act on.

begin;

-- Teams an athlete may ask to join: confirmed teams in tournaments that are still
-- open, minus any team the caller already manages or already has a live
-- (pending/accepted) membership on. Mirrors what request_team_membership will accept,
-- so the picker cannot offer something the RPC would reject.
create or replace function public.list_joinable_teams()
returns table (team_id uuid, team_name text, tournament_id uuid, tournament_name text)
language sql
security definer
stable
set search_path = public, pg_catalog
as $$
  select t.id, t.name, tr.id, tr.name
  from public.teams t
  join public.tournaments tr on tr.id = t.tournament_id
  where auth.uid() is not null
    and t.status = 'confirmed'
    and tr.status = 'open'
    and t.created_by is distinct from auth.uid()
    and tr.organizer_id is distinct from auth.uid()
    and not exists (
      select 1 from public.team_members tm
      where tm.team_id = t.id
        and tm.athlete_id = auth.uid()
        and tm.status in ('pending', 'accepted')
    )
  order by tr.name, t.name
  limit 200;
$$;

-- Display names for teams the caller already has a membership row on, in any state.
-- This is what lets an invitee see which team invited them before accepting, without
-- opening the teams table itself. Scoped strictly to the caller's own rows.
create or replace function public.list_my_team_labels()
returns table (team_id uuid, team_name text, tournament_name text)
language sql
security definer
stable
set search_path = public, pg_catalog
as $$
  select distinct t.id, t.name, tr.name
  from public.team_members tm
  join public.teams t on t.id = tm.team_id
  join public.tournaments tr on tr.id = t.tournament_id
  where auth.uid() is not null
    and tm.athlete_id = auth.uid();
$$;

-- request_team_membership() in step 24 checked only that the team row existed, so a
-- caller who knew or guessed a team UUID could request membership in an unconfirmed
-- team or a closed tournament — bypassing every filter list_joinable_teams() applies.
-- The discovery filter is a convenience for the picker; this is the enforcement.
--
-- Replaced here with the same eligibility rules the discovery function uses, so the
-- two can never drift: a team is requestable only while it is confirmed, its
-- tournament is open, and the caller does not already manage it. Everything the step
-- 24 version guaranteed is preserved unchanged: AUTH_REQUIRED, TEAM_NOT_FOUND, the
-- active-membership block, the 10-minute cooldown, the history-preserving insert
-- (direction = 'request', a new row per period, never an update of an old one), the
-- same signature and return value, and the same grants.
create or replace function public.request_team_membership(p_team_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_member_id uuid;
  v_last_request timestamptz;
  v_team_status text;
  v_tournament_status text;
  v_created_by uuid;
  v_organizer_id uuid;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;

  select t.status, t.created_by, tr.status, tr.organizer_id
    into v_team_status, v_created_by, v_tournament_status, v_organizer_id
  from public.teams t
  join public.tournaments tr on tr.id = t.tournament_id
  where t.id = p_team_id;
  if not found then raise exception 'TEAM_NOT_FOUND' using errcode = 'P0002'; end if;

  -- The caller already knows whether they manage this team, so saying so leaks nothing.
  if v_created_by = v_user_id or v_organizer_id = v_user_id then
    raise exception 'CANNOT_REQUEST_OWN_TEAM' using errcode = '22023';
  end if;

  -- One code for both state checks on purpose: the caller cannot read `teams` under
  -- RLS, so distinguishing "team not confirmed" from "tournament closed" would
  -- describe a row they are not entitled to see.
  if v_team_status is distinct from 'confirmed' or v_tournament_status is distinct from 'open' then
    raise exception 'TEAM_NOT_ACCEPTING_REQUESTS' using errcode = '22023';
  end if;

  if exists (select 1 from public.team_members where team_id = p_team_id and athlete_id = v_user_id and status in ('pending', 'accepted')) then
    raise exception 'ACTIVE_MEMBERSHIP_EXISTS' using errcode = '23505';
  end if;
  select max(created_at) into v_last_request from public.team_members where team_id = p_team_id and athlete_id = v_user_id;
  if v_last_request is not null and v_last_request > now() - interval '10 minutes' then
    raise exception 'TEAM_MEMBERSHIP_RATE_LIMITED' using errcode = 'P0001';
  end if;

  insert into public.team_members (team_id, athlete_id, invited_by, direction)
  values (p_team_id, v_user_id, v_user_id, 'request') returning id into v_member_id;
  return v_member_id;
end;
$$;

revoke all on function public.request_team_membership(uuid) from public;
grant execute on function public.request_team_membership(uuid) to authenticated;

revoke all on function public.list_joinable_teams() from public;
revoke all on function public.list_my_team_labels() from public;
grant execute on function public.list_joinable_teams() to authenticated;
grant execute on function public.list_my_team_labels() to authenticated;

commit;
