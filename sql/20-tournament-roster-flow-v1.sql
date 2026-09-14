-- BallDoenSai.com tournament-scoped roster flow V1
-- Apply after 18-team-members-v1.sql and 19-notification-team-member-privilege-hardening-v1.sql.
-- Teams belong to one tournament only. A coach/organizer builds a roster first;
-- only accepted members may receive a recorded performance for that team.

begin;

-- A draft is a private, tournament-scoped team being assembled. It does not count
-- against capacity until its manager submits it for registration.
do $$
declare
  v_constraint text;
begin
  select conname into v_constraint
  from pg_constraint
  where conrelid = 'public.teams'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%'
  limit 1;
  if v_constraint is not null then
    execute format('alter table public.teams drop constraint %I', v_constraint);
  end if;
end;
$$;

alter table public.teams
  alter column status set default 'draft';
alter table public.teams
  add constraint teams_status_check
  check (status in ('draft', 'pending', 'confirmed', 'rejected'));

create index if not exists teams_tournament_draft_idx
  on public.teams (tournament_id, created_by, created_at desc)
  where status = 'draft';

-- Coach/organizer creates a team for exactly one tournament. Existing `teams`
-- remain registrations for their tournament; no permanent club entity is added.
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

revoke all on function public.create_tournament_team_safely(uuid, text) from public;
grant execute on function public.create_tournament_team_safely(uuid, text) to authenticated;

-- The former registration RPC accepted a free-text roster and immediately
-- created a pending team. Retire it so all new registrations follow this flow.
revoke all on function public.register_team_safely(uuid, text, text) from authenticated;

-- Submit only after at least one invited athlete has accepted. Draft teams do not
-- occupy tournament capacity or accept a payment slip.
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

revoke all on function public.submit_tournament_team_safely(uuid) from public;
grant execute on function public.submit_tournament_team_safely(uuid) to authenticated;

-- A manager can manage only their own tournament team; the event organizer/admin
-- retains operational visibility. Invites are allowed while a roster is a draft.
create or replace function public.invite_team_member(p_team_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_athlete_id uuid;
  v_member_id uuid;
  v_team public.teams%rowtype;
  v_organizer_id uuid;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_team from public.teams where id = p_team_id;
  if v_team.id is null then raise exception 'TEAM_NOT_FOUND'; end if;
  select organizer_id into v_organizer_id from public.tournaments where id = v_team.tournament_id;
  if not coalesce(v_team.created_by = v_user_id or v_organizer_id = v_user_id or public.is_admin(), false) then raise exception 'NOT_ALLOWED'; end if;
  if v_team.status <> 'draft' then raise exception 'ROSTER_LOCKED'; end if;
  select id into v_athlete_id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_athlete_id is null then raise exception 'USER_NOT_FOUND'; end if;
  if v_athlete_id = v_user_id then raise exception 'CANNOT_INVITE_SELF'; end if;
  if not exists (select 1 from public.athlete_profiles where user_id = v_athlete_id) then raise exception 'ATHLETE_PROFILE_REQUIRED'; end if;
  if exists (
    select 1 from public.team_members m join public.teams t on t.id = m.team_id
    where m.athlete_id = v_athlete_id and t.tournament_id = v_team.tournament_id
      and t.id <> v_team.id and m.status in ('pending', 'accepted')
  ) then raise exception 'ATHLETE_ALREADY_ON_TOURNAMENT_ROSTER'; end if;
  insert into public.team_members (team_id, athlete_id, invited_by)
  values (p_team_id, v_athlete_id, v_user_id)
  on conflict (team_id, athlete_id) do update set status = 'pending', invited_by = excluded.invited_by, invited_at = now(), responded_at = null
  returning id into v_member_id;
  perform public.create_notification(v_athlete_id, 'team_invite', 'คุณได้รับคำเชิญเข้าทีม', 'ทีม ' || v_team.name || ' เชิญคุณเข้าร่วมทีม', '/team-members', 'team_invite:' || p_team_id::text || ':' || v_athlete_id::text);
  return v_member_id;
end;
$$;

-- Database-level proof: every recorded player must both belong to the selected
-- team and have accepted the invitation. This protects the API and direct RPC use.
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

drop trigger if exists match_performance_roster_guard on public.match_player_performances;
create trigger match_performance_roster_guard
before insert on public.match_player_performances
for each row execute function public.assert_match_performance_roster_member();

-- Keep payment evidence tied to a submitted registration. The API checks this
-- before uploading, and this trigger closes the direct-table-insert path too.
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

drop trigger if exists payment_team_pending_guard on public.payments;
create trigger payment_team_pending_guard
before insert on public.payments
for each row execute function public.assert_payment_team_is_pending();

commit;
