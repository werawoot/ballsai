-- 102-team-status-rules-v1.sql
-- Staging (vorpnkedpscsqhnrssrl) first, Production (hivedzrwrrcnjrlirhtv) only with separate
-- owner approval. Read the Project ID in Settings > General before each run. Run as postgres.
-- Needs SQL101 on the same project (the teams update policy it lets organizers use).
-- Precheck: sql/102-team-status-rules-precheck.sql. Postcheck: sql/102-team-status-rules-postcheck.sql.
-- Rollback: sql/102-team-status-rules-down.sql (the same on both projects).
--
-- Why (owner, 21 Nov 2026, four answers): an organizer could set any team of their tournament to
-- any status, through /api/teams/<id>/status or a direct update: confirm a team still in draft,
-- confirm a team of a paid tournament whose payment was not confirmed, turn a confirmed team to
-- rejected, reopen a rejected one. confirm_payment_safely also confirmed a team in any status, and
-- let a caller with no profile row, or any organizer on a tournament with no organizer, through,
-- because "null not in (...)" and "null <> x" are never true.
-- The rules the owner chose:
--   1. A team of a tournament with a fee is confirmed only once its payment is confirmed (no
--      "paid outside the app" path).
--   2. A confirmed team stays confirmed.
--   3. A rejected team stays rejected (a way back is separate work).
--   4. An admin may change any status; so may the backend, a session with no signed-in user (the
--      SQL Editor, a migration).
-- So, for everyone else, the only status changes are draft to pending (the coach submits, through
-- submit_tournament_team_safely), pending to confirmed (free tournament, or a confirmed payment),
-- and pending to rejected. Setting the same status again is not a change.
-- What:
--   - enforce_team_status_transition(): a BEFORE UPDATE OF status trigger on public.teams that
--     raises TEAM_STATUS_TRANSITION or TEAM_PAYMENT_REQUIRED (errcode P0001) for anything else.
--     SECURITY DEFINER, so it reads the tournament fee and the payment whatever the caller may see.
--   - confirm_payment_safely(uuid): same name, arguments and grants; refuses a null role and a
--     tournament with no organizer; confirms only a team that is pending (TEAM_NOT_PENDING
--     otherwise, nothing written), or leaves a confirmed one as it is, so a second call is harmless.
-- No table, row, policy or other function changes. Rows today (21 Nov 2026): Production 3 teams,
-- all draft, 0 payments; Staging 1 team, 0 payments. Existing rows are not checked or changed:
-- the trigger only judges a change of status.

begin;

do $$
begin
  if to_regclass('public.teams') is null or to_regclass('public.payments') is null or to_regclass('public.tournaments') is null then
    raise exception 'SQL102 needs public.teams, public.payments and public.tournaments';
  end if;
  if to_regprocedure('public.is_admin()') is null or to_regprocedure('public.confirm_payment_safely(uuid)') is null then
    raise exception 'SQL102 needs public.is_admin() and public.confirm_payment_safely(uuid)';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.teams'::regclass and polname = 'teams_update_organizer_admin') then
    raise exception 'SQL102 needs SQL101 (teams_update_organizer_admin) on this project first';
  end if;
end;
$$;

create or replace function public.enforce_team_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fee numeric;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  -- The backend (no signed-in user) and admins are not bound by these rules (owner, 21 Nov 2026).
  if (select auth.uid()) is null or public.is_admin() then
    return new;
  end if;

  if old.status = 'draft' and new.status = 'pending' then
    return new;
  end if;
  if old.status = 'pending' and new.status = 'rejected' then
    return new;
  end if;
  if old.status = 'pending' and new.status = 'confirmed' then
    select tr.fee into v_fee from public.tournaments tr where tr.id = new.tournament_id;
    if coalesce(v_fee, 0) <= 0
       or exists (select 1 from public.payments p where p.team_id = new.id and p.status = 'confirmed') then
      return new;
    end if;
    raise exception 'TEAM_PAYMENT_REQUIRED' using errcode = 'P0001',
      detail = 'A team of a tournament with a fee is confirmed through its confirmed payment.';
  end if;

  raise exception 'TEAM_STATUS_TRANSITION' using errcode = 'P0001',
    detail = format('%s to %s is not allowed', old.status, new.status);
end;
$$;

revoke all on function public.enforce_team_status_transition() from public, anon, authenticated;

drop trigger if exists team_status_transition_guard on public.teams;
create trigger team_status_transition_guard
before update of status on public.teams
for each row execute function public.enforce_team_status_transition();

create or replace function public.confirm_payment_safely(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_payment public.payments%rowtype;
  v_organizer_id uuid;
  v_team_status text;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select role into v_role from public.profiles where id = v_user_id;
  if v_role is null or v_role not in ('organizer', 'admin') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select organizer_id into v_organizer_id
  from public.tournaments
  where id = v_payment.tournament_id;

  if v_role <> 'admin' and v_organizer_id is distinct from v_user_id then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select status into v_team_status
  from public.teams
  where id = v_payment.team_id
  for update;

  if v_team_status is distinct from 'pending' and v_team_status is distinct from 'confirmed' then
    raise exception 'TEAM_NOT_PENDING' using errcode = 'P0001';
  end if;

  update public.payments
  set status = 'confirmed'
  where id = v_payment.id and status <> 'confirmed';

  update public.teams
  set status = 'confirmed'
  where id = v_payment.team_id and status = 'pending';
end;
$$;

revoke all on function public.confirm_payment_safely(uuid) from public, anon;
grant execute on function public.confirm_payment_safely(uuid) to authenticated, service_role;

commit;
