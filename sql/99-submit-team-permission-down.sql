-- Rollback for SQL99, the project you are on. Puts back the sql/20 body of
-- submit_tournament_team_safely (md5 6cf8a5cd), which reopens T66: a null permission check passes.
-- register_team_safely is not granted back. Only on Staging, and only if the precheck showed
-- register_authenticated true, also run by hand:
--   grant execute on function public.register_team_safely(uuid, text, text) to authenticated;

begin;

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

commit;
