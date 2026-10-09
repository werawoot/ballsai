-- 68-match-plan-free-positions-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first; Production (hivedzrwrrcnjrlirhtv)
-- only with separate owner approval. Depends on SQL28 (present on Production since the
-- 23 Aug 2026 audit). Run as postgres. Precheck: sql/68-match-plan-free-positions-precheck.sql.
--
-- Why: the coach's pitch board (/match-plan) lets a starter be dragged anywhere on the
-- pitch, not only into a formation slot. SQL28 stores the slot (slot_order) and a
-- position (GK/DF/MF/FW) but not where on the pitch the player stands, so a dragged
-- board came back in formation order on another device. This adds that point.
--
-- What changes:
--   * match_plan_players gets pos_x and pos_y (smallint, NULL = stands in its formation
--     slot). Both NULL or both 0-100: a percentage of the pitch width and height, from the
--     left and from the attacking end.
--   * save_match_plan_safely accepts pos_x/pos_y per player. Everything SQL28 checked is
--     unchanged (who may save, accepted roster only, 25 players, no repeats, team lock).
--     A substitute has no point on the pitch. A point outside 0-100, or only one of the
--     two, is refused (INVALID_LINEUP_PLAYER).
--   * get_match_plan_safely returns pos_x/pos_y in each roster row.
-- The app works before and after this file: before, it saves without points (the old
-- function ignores unknown keys) and shows formation slots; after, dragged points stay.
--
-- No index: a plan is read by its plan id (match_plan_players_plan_slot_idx, SQL28) and
-- holds at most 25 rows. No data is changed; existing rows keep NULL points.

begin;

do $$
begin
  if to_regclass('public.match_plan_players') is null
     or to_regprocedure('public.get_match_plan_safely(uuid)') is null
     or to_regprocedure('public.save_match_plan_safely(uuid, text, text, text, jsonb)') is null then
    raise exception 'SQL28 is not applied here: apply sql/28-match-plans-v1.sql first';
  end if;
end;
$$;

alter table public.match_plan_players
  add column if not exists pos_x smallint null,
  add column if not exists pos_y smallint null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'match_plan_players_free_position_check'
      and conrelid = 'public.match_plan_players'::regclass
  ) then
    alter table public.match_plan_players
      add constraint match_plan_players_free_position_check
      check (
        (pos_x is null and pos_y is null)
        or (pos_x between 0 and 100 and pos_y between 0 and 100 and lineup_role = 'starter')
      );
  end if;
end;
$$;

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

-- Signed-in coaches only, by name: a project without SQL50 would otherwise keep anon's
-- default EXECUTE (the lesson of SQL64).
revoke all on function public.get_match_plan_safely(uuid) from public, anon;
revoke all on function public.save_match_plan_safely(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.get_match_plan_safely(uuid) to authenticated;
grant execute on function public.save_match_plan_safely(uuid, text, text, text, jsonb) to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.get_match_plan_safely(uuid)', 'execute')
     or has_function_privilege('anon', 'public.save_match_plan_safely(uuid, text, text, text, jsonb)', 'execute') then
    raise exception 'anon can still call a match plan function';
  end if;
  if not has_function_privilege('authenticated', 'public.save_match_plan_safely(uuid, text, text, text, jsonb)', 'execute') then
    raise exception 'authenticated cannot call save_match_plan_safely';
  end if;
end;
$$;

commit;
