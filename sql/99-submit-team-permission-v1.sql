-- 99-submit-team-permission-v1.sql
-- Staging (vorpnkedpscsqhnrssrl) first, Production (hivedzrwrrcnjrlirhtv) only with separate
-- owner approval. Read the Project ID in Settings > General before each run. Run as postgres.
-- Depends on sql/20 on Production, sql/98 on Staging (submit_tournament_team_safely with the
-- sql/20 body, md5 6cf8a5cd). Precheck: sql/99-submit-team-permission-precheck.sql. Postcheck:
-- sql/99-submit-team-permission-postcheck.sql. Rollback: sql/99-submit-team-permission-down.sql.
--
-- Why (T66, owner: "ทำ sql/99 เลยครับ", 16 Nov 2026): the permission check of
-- submit_tournament_team_safely is "not (created_by = me or organizer_id = me or is_admin())".
-- When the tournament has no organizer_id, or the team has no tournament (an own team, sql/78),
-- the expression is null, "if null" does not raise, and any signed-in user gets past it. The
-- closed check "status <> 'open'" is null the same way when the status is null, and
-- tournaments.status is nullable. Today nothing can be submitted wrongly: every tournament has an
-- organizer and a status, and an own team is stopped by teams_kind_check on the final update. It
-- must not depend on that.
-- What:
--   * submit_tournament_team_safely: a null permission is a refusal (NOT_ALLOWED), a team with
--     no tournament is TOURNAMENT_NOT_FOUND (after the permission check, so a stranger learns
--     nothing about the team), and a status other than exactly 'open' is TOURNAMENT_CLOSED.
--     Everything else, the messages the app maps (app/api/teams/[teamId]/submit/route.ts), the
--     locks and the capacity count, is as in sql/20.
--   * register_team_safely(uuid, text, text): the registration path sql/20 retired. Revoked from
--     public, anon and authenticated where it exists. Production already has it so (no change);
--     on Staging authenticated could still call it. The app does not.
-- Stops, changing nothing, if submit_tournament_team_safely is not the sql/20 body.

begin;

do $$
begin
  if to_regprocedure('public.submit_tournament_team_safely(uuid)') is null or to_regprocedure('public.is_admin()') is null then
    raise exception 'SQL99 needs submit_tournament_team_safely (sql/20 or sql/98) and is_admin()';
  end if;
  if (select md5(prosrc) from pg_proc where oid = 'public.submit_tournament_team_safely(uuid)'::regprocedure)
     not in ('6cf8a5cdacf2357ac7307c771e18d5f5', '8a6bfca466d4ddeaaa38409dde9f52a6') then
    raise exception 'SQL99: submit_tournament_team_safely is not the sql/20 body; review it by hand';
  end if;
end;
$$;

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
  v_has_tournament boolean;
  v_count integer;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_team from public.teams where id = p_team_id for update;
  if not found then raise exception 'TEAM_NOT_FOUND'; end if;
  select * into v_tournament from public.tournaments where id = v_team.tournament_id for update;
  v_has_tournament := found;
  -- A null (no organizer, no tournament) is a refusal, never a pass.
  if not coalesce(v_team.created_by = v_user_id or v_tournament.organizer_id = v_user_id or public.is_admin(), false) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if not v_has_tournament then raise exception 'TOURNAMENT_NOT_FOUND'; end if;
  if v_team.status is distinct from 'draft' then raise exception 'TEAM_NOT_DRAFT'; end if;
  if v_tournament.status is distinct from 'open' then raise exception 'TOURNAMENT_CLOSED'; end if;
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

do $$
begin
  if to_regprocedure('public.register_team_safely(uuid,text,text)') is not null then
    revoke all on function public.register_team_safely(uuid, text, text) from public, anon, authenticated;
  end if;
end;
$$;

do $$
begin
  if (select md5(prosrc) from pg_proc where oid = 'public.submit_tournament_team_safely(uuid)'::regprocedure) <> '8a6bfca466d4ddeaaa38409dde9f52a6'
     or not (select prosecdef from pg_proc where oid = 'public.submit_tournament_team_safely(uuid)'::regprocedure)
     or has_function_privilege('anon', 'public.submit_tournament_team_safely(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.submit_tournament_team_safely(uuid)', 'execute')
     or (to_regprocedure('public.register_team_safely(uuid,text,text)') is not null
         and has_function_privilege('authenticated', 'public.register_team_safely(uuid,text,text)', 'execute')) then
    raise exception 'SQL99 self-check failed';
  end if;
end;
$$;

commit;
