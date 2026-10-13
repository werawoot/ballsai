-- 78-own-team-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first; Production (hivedzrwrrcnjrlirhtv)
-- only with separate owner approval. Read the Project ID in Settings > General before
-- each run. Depends on sql/20 (draft teams, invite_team_member), sql/21 (guardian_links),
-- sql/28 and sql/68 (match plans), sql/17 (create_notification). Run as postgres.
-- Precheck: sql/78-own-team-precheck.sql. Postcheck: sql/78-own-team-postcheck.sql.
-- Rollback: sql/78-own-team-down.sql.
--
-- Design: docs/coach-own-team-v1.md, agreed by the owner 13 Oct 2026 ("ตามที่แนะนำทั้ง 4 ข้อ").
-- AGENTS.md product rule: a coach can work at once, without a tournament.
--
--   - A team was a tournament entry (teams.tournament_id). Every coach tool (events, news,
--     training plans, coach notes, minutes, staff, roster names, match plan) is keyed by
--     teams.id, so a coach had no tools until a tournament was open.
--   - Now a coach has "my team": a teams row with kind 'club' and no tournament, status
--     'draft' (roster open). Every existing tool works on it unchanged. Entering a
--     tournament creates the usual per-tournament team (kind 'entry', source_team_id =
--     the club team), so registration, slips, review, results and fixtures stay as they are.
--
-- Owner decisions:
--   D1 entering a tournament copies the chosen accepted members as accepted, notifies each
--      athlete and their accepted guardians, and lets the athlete or guardian withdraw
--      until the coach submits (withdraw_from_entry). Club invitations say a coach may
--      enter the athlete in tournaments (app wording).
--   D2 an old tournament team is never converted on its own; keep_as_my_team copies it
--      into a club team with its accepted members as pending (they accepted before the
--      club wording existed, so they answer again).
--   D3 anyone who chose "coach" (persona coach_organizer) or holds organizer/admin may
--      create club teams, at most 20 each.
--   D4 an athlete may be in several club teams; within one tournament the existing rule
--      (one roster per tournament) still holds through invite_team_member and here.

begin;

do $$
begin
  if to_regclass('public.teams') is null or to_regclass('public.team_members') is null
     or to_regclass('public.tournaments') is null or to_regclass('public.guardian_links') is null
     or to_regprocedure('public.create_notification(uuid,text,text,text,text,text)') is null
     or to_regprocedure('public.get_match_plan_safely(uuid)') is null
     or to_regprocedure('public.save_match_plan_safely(uuid,text,text,text,jsonb)') is null then
    raise exception 'Prerequisites missing: teams, team_members, tournaments, guardian_links, create_notification, match plan functions (sql/17, 20, 21, 28, 68)';
  end if;
end;
$$;

-- 1. A club team has no tournament.
alter table public.teams alter column tournament_id drop not null;
alter table public.teams add column if not exists kind text not null default 'entry';
alter table public.teams add column if not exists source_team_id uuid references public.teams(id) on delete set null;
alter table public.teams drop constraint if exists teams_kind_check;
alter table public.teams add constraint teams_kind_check check (
  (kind = 'entry' and tournament_id is not null) or (kind = 'club' and tournament_id is null and status = 'draft')
);
create index if not exists teams_club_owner_idx on public.teams (created_by, created_at desc) where kind = 'club';
create index if not exists teams_source_idx on public.teams (source_team_id) where source_team_id is not null;

-- 2. Create my team. The id comes from the app, so a retried request returns the same row.
create or replace function public.create_my_team(p_team_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '[[:space:]]+', ' ', 'g');
  v_role text;
  v_persona text;
  v_owner uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_team_id is null then raise exception 'INVALID_TEAM' using errcode = '22023'; end if;
  if char_length(v_name) not between 2 and 80 or v_name ~ '[[:cntrl:]]' then
    raise exception 'INVALID_TEAM_NAME' using errcode = '22023';
  end if;
  select created_by into v_owner from public.teams where id = p_team_id;
  if found then
    if v_owner = v_user then return p_team_id; end if;
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  select role, onboarding_persona into v_role, v_persona from public.profiles where id = v_user;
  if coalesce(v_role, '') not in ('organizer', 'admin') and coalesce(v_persona, '') <> 'coach_organizer' then
    raise exception 'COACH_ORGANIZER_REQUIRED' using errcode = '42501';
  end if;
  -- Serialise one coach's creations so the limit holds under parallel requests.
  perform pg_advisory_xact_lock(hashtextextended('create_my_team:' || v_user::text, 0));
  if (select count(1) from public.teams where created_by = v_user and kind = 'club') >= 20 then
    raise exception 'TOO_MANY_TEAMS' using errcode = '22023';
  end if;
  insert into public.teams (id, name, members, tournament_id, created_by, status, kind)
  values (p_team_id, v_name, '', null, v_user, 'draft', 'club')
  on conflict (id) do nothing;
  if not exists (select 1 from public.teams where id = p_team_id and created_by = v_user) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  return p_team_id;
end;
$$;

-- 3. Enter a tournament from my team (D1). Returns the entry team; a repeat returns the same.
create or replace function public.enter_tournament_from_team(p_team_id uuid, p_tournament_id uuid, p_athlete_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_club public.teams%rowtype;
  v_tournament public.tournaments%rowtype;
  v_entry uuid;
  v_existing public.teams%rowtype;
  v_athlete uuid;
  v_guardian uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if coalesce(cardinality(p_athlete_ids), 0) not between 1 and 60 then
    raise exception 'INVALID_ROSTER' using errcode = '22023';
  end if;
  v_club := (select x from public.teams x where id = p_team_id);
  if v_club.id is null or v_club.kind <> 'club' or v_club.created_by <> v_user then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  v_tournament := (select x from public.tournaments x where id = p_tournament_id for update);
  if v_tournament.id is null then raise exception 'TOURNAMENT_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_tournament.status <> 'open' then raise exception 'TOURNAMENT_CLOSED' using errcode = '55000'; end if;

  v_existing := (select x from public.teams x where tournament_id = p_tournament_id and created_by = v_user);
  if v_existing.id is not null then
    if v_existing.source_team_id = p_team_id then return v_existing.id; end if;
    raise exception 'ALREADY_HAS_TEAM_FOR_TOURNAMENT' using errcode = '23505';
  end if;

  if exists (
    select 1 from unnest(p_athlete_ids) a(id)
    where not exists (select 1 from public.team_members m where m.team_id = p_team_id and m.athlete_id = a.id and m.status = 'accepted')
  ) then
    raise exception 'ATHLETE_NOT_ON_TEAM' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.team_members m join public.teams t on t.id = m.team_id
    where t.tournament_id = p_tournament_id and m.athlete_id = any(p_athlete_ids) and m.status in ('pending', 'accepted')
  ) then
    raise exception 'ATHLETE_ALREADY_ON_TOURNAMENT_ROSTER' using errcode = '23505';
  end if;

  insert into public.teams (name, members, tournament_id, created_by, status, kind, source_team_id)
  values (v_club.name, '', p_tournament_id, v_user, 'draft', 'entry', p_team_id)
  returning id into v_entry;

  foreach v_athlete in array (select array_agg(distinct x) from unnest(p_athlete_ids) x) loop
    insert into public.team_members (team_id, athlete_id, invited_by, status, responded_at)
    values (v_entry, v_athlete, v_user, 'accepted', now());
    perform public.create_notification(v_athlete, 'team_status',
      'โค้ชพาคุณลงแข่ง: ' || v_tournament.name,
      'ทีม ' || v_club.name || ' · ถ้าไม่ต้องการลงแข่งรายการนี้ ถอนตัวได้ก่อนโค้ชส่งสมัคร',
      '/team-members', 'team_entry:' || v_entry::text || ':' || v_athlete::text);
    for v_guardian in select g.guardian_id from public.guardian_links g where g.athlete_id = v_athlete and g.status = 'accepted' loop
      perform public.create_notification(v_guardian, 'team_status',
        'โค้ชพาลูกของคุณลงแข่ง: ' || v_tournament.name,
        'ทีม ' || v_club.name || ' · ถ้าไม่ต้องการให้ลงแข่งรายการนี้ ถอนตัวได้ก่อนโค้ชส่งสมัคร',
        '/team-members', 'team_entry:' || v_entry::text || ':' || v_athlete::text || ':' || v_guardian::text);
    end loop;
  end loop;
  return v_entry;
end;
$$;

-- 4. Withdraw from an entry before it is submitted (D1): the athlete or an accepted guardian.
create or replace function public.withdraw_from_entry(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_member public.team_members%rowtype;
  v_team public.teams%rowtype;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  v_member := (select x from public.team_members x where id = p_member_id for update);
  if v_member.id is null then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  if not (v_member.athlete_id = v_user or exists (
    select 1 from public.guardian_links g where g.athlete_id = v_member.athlete_id and g.guardian_id = v_user and g.status = 'accepted'
  )) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  v_team := (select x from public.teams x where id = v_member.team_id);
  if v_team.kind <> 'entry' then raise exception 'NOT_AN_ENTRY' using errcode = '22023'; end if;
  if v_team.status <> 'draft' then raise exception 'ROSTER_LOCKED' using errcode = '55000'; end if;
  if v_member.status = 'declined' then return; end if;
  update public.team_members set status = 'declined', responded_at = now() where id = p_member_id;
end;
$$;

-- 4b. The tournament entries of the caller and of the children they guard, with whether each
-- can still withdraw (D1). A guardian cannot read team_members, so this is how they see it.
create or replace function public.my_entry_rosters(p_limit integer default 50)
returns table (member_id uuid, team_id uuid, team_name text, tournament_name text, start_date date,
               athlete_id uuid, athlete_name text, status text, can_withdraw boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, t.id, t.name, tr.name, tr.start_date, m.athlete_id, nullif(trim(ap.display_name), ''), m.status,
         m.status = 'accepted' and t.status = 'draft'
  from public.team_members m
  join public.teams t on t.id = m.team_id and t.kind = 'entry'
  join public.tournaments tr on tr.id = t.tournament_id
  left join public.athlete_profiles ap on ap.user_id = m.athlete_id
  where (select auth.uid()) is not null
    and m.status in ('accepted', 'declined')
    and (m.athlete_id = (select auth.uid()) or exists (
      select 1 from public.guardian_links g
      where g.athlete_id = m.athlete_id and g.guardian_id = (select auth.uid()) and g.status = 'accepted'
    ))
  order by tr.start_date desc nulls last, m.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

-- 5. Keep an old tournament team as my team (D2): its accepted members are asked again.
create or replace function public.keep_as_my_team(p_team_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_team public.teams%rowtype;
  v_club uuid;
  v_row record;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  v_team := (select x from public.teams x where id = p_team_id);
  if v_team.id is null or v_team.kind <> 'entry' or v_team.created_by <> v_user then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('create_my_team:' || v_user::text, 0));
  select id into v_club from public.teams where kind = 'club' and created_by = v_user and source_team_id = p_team_id;
  if found then return v_club; end if;
  if (select count(1) from public.teams where created_by = v_user and kind = 'club') >= 20 then
    raise exception 'TOO_MANY_TEAMS' using errcode = '22023';
  end if;
  insert into public.teams (name, members, tournament_id, created_by, status, kind, source_team_id)
  values (v_team.name, '', null, v_user, 'draft', 'club', p_team_id)
  returning id into v_club;
  for v_row in select m.athlete_id from public.team_members m where m.team_id = p_team_id and m.status = 'accepted' loop
    insert into public.team_members (team_id, athlete_id, invited_by, status)
    values (v_club, v_row.athlete_id, v_user, 'pending');
    perform public.create_notification(v_row.athlete_id, 'team_invite', 'คุณได้รับคำเชิญเข้าทีม',
      'ทีม ' || v_team.name || ' เชิญคุณเข้าร่วมทีม', '/team-members',
      'team_invite:' || v_club::text || ':' || v_row.athlete_id::text);
  end loop;
  return v_club;
end;
$$;

-- 6. The match plan of a team without a tournament (sql/68 bodies, inner join -> left join).
create or replace function public.get_match_plan_safely(p_team_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_allowed boolean;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.teams t
    left join public.tournaments tr on tr.id = t.tournament_id
    where t.id = p_team_id
      and (t.created_by = v_user_id or tr.organizer_id = v_user_id or public.is_admin())
  ) into v_allowed;

  if not v_allowed then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'plan', (
      select jsonb_build_object(
        'id', mp.id,
        'formation', mp.formation,
        'match_focus', mp.match_focus,
        'team_talk', mp.team_talk,
        'updated_at', mp.updated_at
      )
      from public.match_plans mp
      where mp.team_id = p_team_id
    ),
    'roster', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'athlete_id', tm.athlete_id,
          'display_name', coalesce(nullif(ap.display_name, ''), 'นักกีฬา'),
          'profile_position', ap.position,
          'lineup_role', mpp.lineup_role,
          'position', mpp.position,
          'slot_order', mpp.slot_order,
          'pos_x', mpp.pos_x,
          'pos_y', mpp.pos_y
        ) order by mpp.lineup_role nulls last, mpp.slot_order nulls last, ap.display_name
      )
      from public.team_members tm
      left join public.athlete_profiles ap on ap.user_id = tm.athlete_id
      left join public.match_plans mp on mp.team_id = p_team_id
      left join public.match_plan_players mpp
        on mpp.match_plan_id = mp.id and mpp.athlete_id = tm.athlete_id
      where tm.team_id = p_team_id and tm.status = 'accepted'
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.save_match_plan_safely(
  p_team_id uuid,
  p_formation text,
  p_match_focus text,
  p_team_talk text,
  p_players jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_team_id uuid;
  v_plan_id uuid;
  v_player_count integer;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_formation, ''))) not between 2 and 30
    or char_length(coalesce(p_match_focus, '')) > 1000
    or char_length(coalesce(p_team_talk, '')) > 1000
    or jsonb_typeof(p_players) <> 'array' then
    raise exception 'INVALID_MATCH_PLAN' using errcode = '22023';
  end if;

  -- Lock the team so two coaches cannot overwrite one another's plan midway.
  select t.id into v_team_id
    from public.teams t
    left join public.tournaments tr on tr.id = t.tournament_id
    where t.id = p_team_id
      and (t.created_by = v_user_id or tr.organizer_id = v_user_id or public.is_admin())
    for update of t;
  if v_team_id is null then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  select count(1) into v_player_count from jsonb_array_elements(p_players);
  if v_player_count > 25 then
    raise exception 'TOO_MANY_PLAYERS' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_players) as item(
      athlete_id uuid,
      lineup_role text,
      position text,
      slot_order smallint,
      pos_x smallint,
      pos_y smallint
    )
    where athlete_id is null
      or lineup_role not in ('starter', 'substitute')
      or position not in ('GK', 'DF', 'MF', 'FW')
      or slot_order is null
      or slot_order not between 0 and 24
      -- A point on the pitch: both or neither, inside the pitch, starters only.
      or (pos_x is null) <> (pos_y is null)
      or pos_x not between 0 and 100
      or pos_y not between 0 and 100
      or (pos_x is not null and lineup_role <> 'starter')
  ) then
    raise exception 'INVALID_LINEUP_PLAYER' using errcode = '22023';
  end if;

  if (select count(distinct (item->>'athlete_id')) from jsonb_array_elements(p_players) item) <> v_player_count then
    raise exception 'DUPLICATE_LINEUP_PLAYER' using errcode = '22023';
  end if;

  -- The database, not just the UI, keeps a plan constrained to accepted roster
  -- members. A crafted request cannot select an invited or unrelated athlete.
  if exists (
    select 1
    from jsonb_to_recordset(p_players) as item(
      athlete_id uuid,
      lineup_role text,
      position text,
      slot_order smallint
    )
    where not exists (
      select 1 from public.team_members tm
      where tm.team_id = p_team_id
        and tm.athlete_id = item.athlete_id
        and tm.status = 'accepted'
    )
  ) then
    raise exception 'PLAYER_NOT_ACCEPTED_ON_TEAM_ROSTER' using errcode = '42501';
  end if;

  insert into public.match_plans (team_id, formation, match_focus, team_talk, created_by)
  values (
    p_team_id,
    trim(p_formation),
    trim(coalesce(p_match_focus, '')),
    trim(coalesce(p_team_talk, '')),
    v_user_id
  )
  on conflict (team_id) do update
  set formation = excluded.formation,
      match_focus = excluded.match_focus,
      team_talk = excluded.team_talk
  returning id into v_plan_id;

  delete from public.match_plan_players where match_plan_id = v_plan_id;

  insert into public.match_plan_players (match_plan_id, athlete_id, lineup_role, position, slot_order, pos_x, pos_y)
  select v_plan_id, item.athlete_id, item.lineup_role, item.position, item.slot_order, item.pos_x, item.pos_y
  from jsonb_to_recordset(p_players) as item(
    athlete_id uuid,
    lineup_role text,
    position text,
    slot_order smallint,
    pos_x smallint,
    pos_y smallint
  );

  return v_plan_id;
end;
$$;

revoke all on function public.create_my_team(uuid, text) from public, anon;
revoke all on function public.enter_tournament_from_team(uuid, uuid, uuid[]) from public, anon;
revoke all on function public.withdraw_from_entry(uuid) from public, anon;
revoke all on function public.keep_as_my_team(uuid) from public, anon;
revoke all on function public.my_entry_rosters(integer) from public, anon;
revoke all on function public.get_match_plan_safely(uuid) from public, anon;
revoke all on function public.save_match_plan_safely(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.create_my_team(uuid, text) to authenticated;
grant execute on function public.enter_tournament_from_team(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.withdraw_from_entry(uuid) to authenticated;
grant execute on function public.keep_as_my_team(uuid) to authenticated;
grant execute on function public.my_entry_rosters(integer) to authenticated;
grant execute on function public.get_match_plan_safely(uuid) to authenticated;
grant execute on function public.save_match_plan_safely(uuid, text, text, text, jsonb) to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.create_my_team(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.enter_tournament_from_team(uuid, uuid, uuid[])', 'execute')
     or has_function_privilege('anon', 'public.withdraw_from_entry(uuid)', 'execute')
     or has_function_privilege('anon', 'public.keep_as_my_team(uuid)', 'execute')
     or has_function_privilege('anon', 'public.my_entry_rosters(integer)', 'execute')
     or has_function_privilege('anon', 'public.get_match_plan_safely(uuid)', 'execute') then
    raise exception 'SQL78 privileges are wider than intended';
  end if;
end;
$$;

commit;
