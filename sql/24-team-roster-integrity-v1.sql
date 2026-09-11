-- BallDoenSai.com Team Roster Integrity V1
-- Apply after sql/18-team-members-v1.sql and sql/production-hardening.sql.
-- Additive history-preserving roster lifecycle and fail-closed match confirmation.

begin;

alter table public.team_members
  add column if not exists direction text not null default 'invite'
    check (direction in ('invite', 'request')),
  add column if not exists accepted_at timestamptz,
  add column if not exists removed_at timestamptz,
  add column if not exists removed_by uuid references auth.users(id) on delete restrict,
  add column if not exists removed_reason text
    check (removed_reason is null or char_length(trim(removed_reason)) between 10 and 500);

update public.team_members
set accepted_at = coalesce(responded_at, created_at)
where status = 'accepted' and accepted_at is null;

update public.team_members
set removed_at = coalesce(responded_at, created_at)
where status = 'removed' and removed_at is null;

alter table public.team_members
  drop constraint if exists team_members_team_id_athlete_id_key;

create unique index if not exists team_members_one_active_period_idx
  on public.team_members (team_id, athlete_id)
  where status in ('pending', 'accepted');

create index if not exists team_members_team_status_idx
  on public.team_members (team_id, status, created_at desc);

alter table public.match_player_performances
  add column if not exists team_membership_id uuid
    references public.team_members(id) on delete restrict,
  add column if not exists membership_verified_at timestamptz;

create index if not exists match_player_performances_membership_idx
  on public.match_player_performances (team_membership_id)
  where team_membership_id is not null;

drop policy if exists "team_members_select_owner_or_member" on public.team_members;
create policy "team_members_select_owner_or_member"
on public.team_members for select to authenticated
using (
  athlete_id = (select auth.uid())
  or invited_by = (select auth.uid())
  or public.is_admin()
  or exists (
    select 1 from public.teams t
    where t.id = team_members.team_id and t.created_by = (select auth.uid())
  )
  or exists (
    select 1 from public.teams t
    join public.tournaments tr on tr.id = t.tournament_id
    where t.id = team_members.team_id and tr.organizer_id = (select auth.uid())
  )
);

-- Lifecycle writes are RPC-only. Direct table UPDATE is removed so athletes cannot
-- accept on behalf of another account and team managers cannot bypass state checks.
drop policy if exists "team_members_update_member_or_owner" on public.team_members;
revoke update on table public.team_members from authenticated;

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
  v_last_request timestamptz;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_team from public.teams t where t.id = p_team_id;
  if not found then raise exception 'TEAM_NOT_FOUND' using errcode = 'P0002'; end if;
  if not (
    public.is_admin()
    or v_team.created_by = v_user_id
    or exists (select 1 from public.tournaments tr where tr.id = v_team.tournament_id and tr.organizer_id = v_user_id)
  ) then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;

  select id into v_athlete_id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_athlete_id is null then raise exception 'USER_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_athlete_id = v_user_id then raise exception 'CANNOT_INVITE_SELF' using errcode = '22023'; end if;
  if exists (select 1 from public.team_members where team_id = p_team_id and athlete_id = v_athlete_id and status in ('pending', 'accepted')) then
    raise exception 'ACTIVE_MEMBERSHIP_EXISTS' using errcode = '23505';
  end if;
  select max(created_at) into v_last_request from public.team_members
  where team_id = p_team_id and athlete_id = v_athlete_id;
  if v_last_request is not null and v_last_request > now() - interval '10 minutes' then
    raise exception 'TEAM_MEMBERSHIP_RATE_LIMITED' using errcode = 'P0001';
  end if;

  insert into public.team_members (team_id, athlete_id, invited_by, direction)
  values (p_team_id, v_athlete_id, v_user_id, 'invite') returning id into v_member_id;

  perform public.create_notification(
    v_athlete_id, 'team_invite', 'คุณได้รับคำเชิญเข้าทีม',
    'ทีม ' || v_team.name || ' เชิญคุณเข้าร่วมทีม',
    '/team-members', 'team_invite:' || v_member_id::text
  );
  return v_member_id;
end;
$$;

create or replace function public.respond_team_invite(p_member_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if p_status not in ('accepted', 'declined') then raise exception 'INVALID_STATUS' using errcode = '22023'; end if;
  update public.team_members
  set status = p_status,
      responded_at = now(),
      accepted_at = case when p_status = 'accepted' then now() else null end
  where id = p_member_id and athlete_id = auth.uid() and direction = 'invite' and status = 'pending';
  if not found then raise exception 'INVITE_NOT_FOUND' using errcode = 'P0002'; end if;
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
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not exists (select 1 from public.teams where id = p_team_id) then raise exception 'TEAM_NOT_FOUND' using errcode = 'P0002'; end if;
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

revoke all on function public.request_team_membership(uuid) from public;
revoke all on function public.approve_team_request(uuid) from public;
revoke all on function public.decline_team_request(uuid) from public;
revoke all on function public.remove_team_member(uuid, text) from public;
grant execute on function public.request_team_membership(uuid) to authenticated;
grant execute on function public.approve_team_request(uuid) to authenticated;
grant execute on function public.decline_team_request(uuid) to authenticated;
grant execute on function public.remove_team_member(uuid, text) to authenticated;

-- Replace the confirmation function with the existing rating transaction plus a
-- roster check. The accepted row is locked and snapshotted for every performance.
create or replace function public.record_match_result_safely(
  p_tournament_id uuid, p_team_a_id uuid, p_team_b_id uuid,
  p_team_a_score integer, p_team_b_score integer, p_performances jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid(); v_role text; v_organizer_id uuid; v_match_id uuid;
  v_item jsonb; v_rating public.player_ratings%rowtype; v_rank public.player_ranks%rowtype;
  v_player_rank_id uuid; v_team_id uuid; v_membership_id uuid; v_verified_at timestamptz;
  v_result text; v_rating_before integer; v_rating_after integer; v_rating_change integer;
  v_match_change integer; v_performance_bonus integer; v_opponent_rating integer;
  v_goals integer; v_assists integer; v_clean_sheet boolean; v_mvp boolean;
  v_save_percentage numeric(5,2);
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select role into v_role from public.profiles where id = v_user_id;
  select organizer_id into v_organizer_id from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'TOURNAMENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_role not in ('organizer','admin') or (v_role <> 'admin' and v_organizer_id <> v_user_id) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_team_a_id = p_team_b_id or p_team_a_score < 0 or p_team_b_score < 0 or jsonb_typeof(p_performances) <> 'array' or jsonb_array_length(p_performances) = 0 then raise exception 'INVALID_MATCH_DATA' using errcode = '22023'; end if;
  if (select count(*) from public.teams where id in (p_team_a_id,p_team_b_id) and tournament_id = p_tournament_id) <> 2 then raise exception 'INVALID_TEAMS' using errcode = '22023'; end if;

  insert into public.match_results (tournament_id,team_a_id,team_b_id,team_a_score,team_b_score,created_by)
  values (p_tournament_id,p_team_a_id,p_team_b_id,p_team_a_score,p_team_b_score,v_user_id)
  returning id into v_match_id;

  for v_item in select value from jsonb_array_elements(p_performances) loop
    v_player_rank_id := (v_item->>'playerRankId')::uuid; v_team_id := (v_item->>'teamId')::uuid;
    v_result := v_item->>'result'; v_rating_before := (v_item->>'ratingBefore')::integer;
    v_rating_after := (v_item->>'ratingAfter')::integer; v_rating_change := (v_item->>'ratingChange')::integer;
    v_match_change := (v_item->>'matchChange')::integer; v_performance_bonus := (v_item->>'performanceBonus')::integer;
    v_opponent_rating := (v_item->>'opponentRating')::integer; v_goals := coalesce((v_item->>'goals')::integer,0);
    v_assists := coalesce((v_item->>'assists')::integer,0); v_clean_sheet := coalesce((v_item->>'cleanSheet')::boolean,false);
    v_mvp := coalesce((v_item->>'mvp')::boolean,false); v_save_percentage := nullif(v_item->>'savePercentage','')::numeric(5,2);
    if v_team_id not in (p_team_a_id,p_team_b_id) or v_result not in ('win','draw','loss') or v_rating_after not between 0 and 3000 or v_opponent_rating not between 0 and 3000 or v_goals < 0 or v_assists < 0 then raise exception 'INVALID_PERFORMANCE_DATA' using errcode = '22023'; end if;

    select * into v_rank from public.player_ranks where id = v_player_rank_id;
    if not found then raise exception 'PLAYER_NOT_FOUND' using errcode = 'P0002'; end if;
    if v_rank.player_id is null then raise exception 'PLAYER_RANK_NOT_LINKED_TO_ACCOUNT' using errcode = '22023'; end if;
    select tm.id, now() into v_membership_id, v_verified_at
    from public.team_members tm
    where tm.team_id = v_team_id and tm.athlete_id = v_rank.player_id and tm.status = 'accepted'
    for share;
    if not found then raise exception 'ATHLETE_NOT_ON_TEAM_ROSTER' using errcode = '22023'; end if;

    select * into v_rating from public.player_ratings
    where player_rank_id = v_player_rank_id and sport = v_rank.sport and season = v_rank.season for update;
    if not found then raise exception 'RATING_NOT_FOUND' using errcode = 'P0002'; end if;
    if v_rating.power_rating <> v_rating_before then raise exception 'RATING_CHANGED' using errcode = '40001'; end if;

    update public.player_ratings set power_rating=v_rating_after, matches_played=v_rating.matches_played+1,
      wins=v_rating.wins+case when v_result='win' then 1 else 0 end,
      draws=v_rating.draws+case when v_result='draw' then 1 else 0 end,
      losses=v_rating.losses+case when v_result='loss' then 1 else 0 end,
      goals=v_rating.goals+v_goals, assists=v_rating.assists+v_assists,
      clean_sheets=v_rating.clean_sheets+case when v_clean_sheet then 1 else 0 end,
      mvps=v_rating.mvps+case when v_mvp then 1 else 0 end,
      last_rating_change=v_rating_change, updated_at=now() where id=v_rating.id;
    update public.player_ranks set pts=v_rating_after,
      ovr=greatest(40,least(99,round(40+(v_rating_after::numeric/3000)*59)::integer)),
      rank_change=v_rating_change where id=v_player_rank_id;
    insert into public.rating_events (player_rating_id,sport,match_id,result,opponent_rating,rating_before,rating_after,rating_change,match_change,performance_bonus,goals,assists,clean_sheet,mvp,save_percentage,created_by)
    values (v_rating.id,v_rank.sport,v_match_id,v_result,v_opponent_rating,v_rating_before,v_rating_after,v_rating_change,v_match_change,v_performance_bonus,v_goals,v_assists,v_clean_sheet,v_mvp,v_save_percentage,v_user_id);
    insert into public.match_player_performances (match_result_id,player_rank_id,team_id,result,rating_before,rating_after,rating_change,goals,assists,clean_sheet,mvp,save_percentage,team_membership_id,membership_verified_at)
    values (v_match_id,v_player_rank_id,v_team_id,v_result,v_rating_before,v_rating_after,v_rating_change,v_goals,v_assists,v_clean_sheet,v_mvp,v_save_percentage,v_membership_id,v_verified_at);
  end loop;
  return v_match_id;
end;
$$;

revoke all on function public.record_match_result_safely(uuid,uuid,uuid,integer,integer,jsonb) from public;
grant execute on function public.record_match_result_safely(uuid,uuid,uuid,integer,integer,jsonb) to authenticated;

commit;
