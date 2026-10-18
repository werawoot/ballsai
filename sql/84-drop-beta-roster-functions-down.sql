-- Rollback for SQL84, same project, owner approval. Only if something turns out to need one
-- of the six beta functions: this puts back their beta source unchanged (sql/24 and sql/25 of
-- codex/player-card-beta, commit 36f7f7c), with the beta grants, which reopens the gaps that
-- SQL84 closes. Fingerprints after: remove_team_member 3f916720, request_team_membership
-- 26cdc923, approve_team_request a1058ab4, decline_team_request 4f106579, list_joinable_teams
-- ab69c72f, list_my_team_labels df9bf25d.

begin;

create or replace function public.remove_team_member(p_member_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if char_length(trim(coalesce(p_reason, ''))) not between 10 and 500 then
    raise exception 'INVALID_REMOVAL_REASON' using errcode = '22023';
  end if;
  update public.team_members tm
  set status = 'removed', removed_at = now(), removed_by = v_user_id,
      removed_reason = trim(p_reason), responded_at = coalesce(responded_at, now())
  where tm.id = p_member_id and tm.status = 'accepted'
    and (
      tm.athlete_id = v_user_id
      or public.is_admin()
      or exists (select 1 from public.teams t where t.id = tm.team_id and t.created_by = v_user_id)
      or exists (
        select 1 from public.teams t join public.tournaments tr on tr.id = t.tournament_id
        where t.id = tm.team_id and tr.organizer_id = v_user_id
      )
    );
  if not found then raise exception 'ACTIVE_MEMBERSHIP_NOT_FOUND' using errcode = 'P0002'; end if;
end;
$$;

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

create or replace function public.approve_team_request(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
begin
  update public.team_members tm
  set status = 'accepted', responded_at = now(), accepted_at = now()
  where tm.id = p_member_id and tm.direction = 'request' and tm.status = 'pending'
    and (
      public.is_admin()
      or exists (select 1 from public.teams t where t.id = tm.team_id and t.created_by = v_user_id)
      or exists (
        select 1 from public.teams t join public.tournaments tr on tr.id = t.tournament_id
        where t.id = tm.team_id and tr.organizer_id = v_user_id
      )
    );
  if not found then raise exception 'TEAM_REQUEST_NOT_FOUND' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.decline_team_request(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
begin
  update public.team_members tm set status = 'declined', responded_at = now()
  where tm.id = p_member_id and tm.direction = 'request' and tm.status = 'pending'
    and (
      public.is_admin()
      or exists (select 1 from public.teams t where t.id = tm.team_id and t.created_by = v_user_id)
      or exists (
        select 1 from public.teams t join public.tournaments tr on tr.id = t.tournament_id
        where t.id = tm.team_id and tr.organizer_id = v_user_id
      )
    );
  if not found then raise exception 'TEAM_REQUEST_NOT_FOUND' using errcode = 'P0002'; end if;
end;
$$;

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

revoke all on function public.remove_team_member(uuid, text) from public;
revoke all on function public.request_team_membership(uuid) from public;
revoke all on function public.approve_team_request(uuid) from public;
revoke all on function public.decline_team_request(uuid) from public;
revoke all on function public.list_joinable_teams() from public;
revoke all on function public.list_my_team_labels() from public;
grant execute on function public.remove_team_member(uuid, text) to authenticated;
grant execute on function public.request_team_membership(uuid) to authenticated;
grant execute on function public.approve_team_request(uuid) to authenticated;
grant execute on function public.decline_team_request(uuid) to authenticated;
grant execute on function public.list_joinable_teams() to authenticated;
grant execute on function public.list_my_team_labels() to authenticated;

commit;
