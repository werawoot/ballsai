-- Rollback for SQL78 only (not part of the apply order). Refuses while any club team
-- (kind 'club') exists: removing the feature then would orphan coaches' teams and their
-- events, plans and notes. Entry teams made from a club keep working as ordinary
-- tournament teams. teams.tournament_id stays optional (the precheck recorded whether it
-- was required before; restore NOT NULL by hand only if it was and no row is null).
begin;

do $$
begin
  if to_regprocedure('public.create_my_team(uuid,text)') is null then
    raise exception 'SQL78 is not applied';
  end if;
  if exists (select 1 from public.teams where kind = 'club') then
    raise exception 'Club teams exist; rollback would orphan them';
  end if;
end;
$$;

drop function if exists public.my_entry_rosters(integer);
drop function if exists public.keep_as_my_team(uuid);
drop function if exists public.withdraw_from_entry(uuid);
drop function if exists public.enter_tournament_from_team(uuid, uuid, uuid[]);
drop function if exists public.create_my_team(uuid, text);
alter table public.teams drop constraint if exists teams_kind_check;
drop index if exists public.teams_club_owner_idx;
drop index if exists public.teams_source_idx;
alter table public.teams drop column if exists source_team_id;
alter table public.teams drop column if exists kind;

-- The match plan functions as sql/68 left them.
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
    join public.tournaments tr on tr.id = t.tournament_id
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
    join public.tournaments tr on tr.id = t.tournament_id
    where t.id = p_team_id
      and (t.created_by = v_user_id or tr.organizer_id = v_user_id or public.is_admin())
    for update of t;
  if v_team_id is null then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  select count(*) into v_player_count from jsonb_array_elements(p_players);
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

revoke all on function public.get_match_plan_safely(uuid) from public, anon;
revoke all on function public.save_match_plan_safely(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.get_match_plan_safely(uuid) to authenticated;
grant execute on function public.save_match_plan_safely(uuid, text, text, text, jsonb) to authenticated;

commit;
