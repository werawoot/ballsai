-- 65-match-result-void-null-safe-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first; Production (hivedzrwrrcnjrlirhtv)
-- only with separate owner approval. Supersedes sql/match-result-void-v1.sql: apply this
-- file instead of it on a project that does not have void_match_result_safely yet, or after
-- it on one that does. Safe to re-run (create or replace, if not exists). Run as postgres.
--
-- Why: match-result-void-v1 refused a caller with
--   if v_role not in ('organizer', 'admin') or (v_role <> 'admin' and v_organizer_id <> v_user_id)
-- In SQL a comparison with NULL is NULL, and IF NULL does not raise. So a signed-in user
-- with no profiles row (v_role NULL) could void ANY match, and any organizer could void a
-- match whose tournament has no organizer_id. Found on 4 Oct 2026 reviewing the file
-- before its Production apply, which was stopped. The truth table was checked on
-- Postgres 16: the old test lets those three cases through, the new one refuses them and
-- still lets the tournament's organizer and an admin void.
--
-- Also revokes EXECUTE from anon and service_role by name (Supabase grants a new function
-- to them directly until SQL50; see SQL64), and proves both in-file. Nothing else in the
-- function body changes.

begin;

create index if not exists rating_events_match_id_idx
  on public.rating_events (match_id)
  where match_id is not null;

create or replace function public.void_match_result_safely(p_match_result_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_match public.match_results%rowtype;
  v_organizer_id uuid;
  v_event public.rating_events%rowtype;
  v_rating public.player_ratings%rowtype;
  v_latest_event_id uuid;
  v_reverted integer := 0;
  v_athletes uuid[] := '{}';
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_match from public.match_results where id = p_match_result_id for update;
  if not found then
    raise exception 'MATCH_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_match.status = 'void' then
    raise exception 'ALREADY_VOID' using errcode = '22023';
  end if;

  select role into v_role from public.profiles where id = v_user_id;
  select organizer_id into v_organizer_id
  from public.tournaments
  where id = v_match.tournament_id;

  if v_role is null or v_role not in ('organizer', 'admin')
     or (v_role <> 'admin' and v_organizer_id is distinct from v_user_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  for v_event in
    select * from public.rating_events
    where match_id = p_match_result_id
    order by created_at
  loop
    select * into v_rating
    from public.player_ratings
    where id = v_event.player_rating_id
    for update;
    if not found then
      continue;
    end if;

    -- Reverting is only safe while this is the athlete's most recent event.
    select id into v_latest_event_id
    from public.rating_events
    where player_rating_id = v_event.player_rating_id
    order by created_at desc, id desc
    limit 1;

    if v_latest_event_id is distinct from v_event.id then
      raise exception 'NEWER_RESULT_EXISTS' using errcode = '40001';
    end if;

    update public.player_ratings set
      power_rating = v_event.rating_before,
      matches_played = greatest(0, v_rating.matches_played - 1),
      wins = greatest(0, v_rating.wins - case when v_event.result = 'win' then 1 else 0 end),
      draws = greatest(0, v_rating.draws - case when v_event.result = 'draw' then 1 else 0 end),
      losses = greatest(0, v_rating.losses - case when v_event.result = 'loss' then 1 else 0 end),
      goals = greatest(0, v_rating.goals - v_event.goals),
      assists = greatest(0, v_rating.assists - v_event.assists),
      clean_sheets = greatest(0, v_rating.clean_sheets - case when v_event.clean_sheet then 1 else 0 end),
      mvps = greatest(0, v_rating.mvps - case when v_event.mvp then 1 else 0 end),
      last_rating_change = 0,
      updated_at = now()
    where id = v_rating.id;

    if v_rating.player_rank_id is not null then
      update public.player_ranks set
        pts = v_event.rating_before,
        ovr = greatest(40, least(99, round(40 + (v_event.rating_before::numeric / 3000) * 59)::integer)),
        rank_change = 0
      where id = v_rating.player_rank_id;
    end if;

    if v_rating.player_id is not null then
      v_athletes := array_append(v_athletes, v_rating.player_id);
    end if;
    v_reverted := v_reverted + 1;
  end loop;

  -- Deleting the events cascades athlete_xp_events and clears
  -- athlete_badges.source_rating_event_id.
  delete from public.rating_events where match_id = p_match_result_id;

  update public.athlete_progress progress
  set xp_total = coalesce(totals.xp_total, 0),
      current_level = least(99, 1 + floor(sqrt(coalesce(totals.xp_total, 0) / 100.0))::smallint),
      updated_at = now()
  from (
    select athletes.athlete_id,
           (select sum(xp_amount)::integer from public.athlete_xp_events events
             where events.athlete_id = athletes.athlete_id) as xp_total
    from (select distinct unnest(v_athletes) as athlete_id) athletes
  ) totals
  where progress.athlete_id = totals.athlete_id;

  -- A badge earned from a voided match must go back too, otherwise the passport
  -- would keep an achievement that no verified result supports. The 'rookie' badge
  -- comes from creating a profile, never from a match, so it is left alone.
  delete from public.athlete_badges badges
  using (
    select ratings.player_id as athlete_id,
           sum(ratings.matches_played) as matches_played,
           sum(ratings.wins) as wins,
           sum(ratings.goals) as goals,
           sum(ratings.assists) as assists,
           sum(ratings.clean_sheets) as clean_sheets,
           sum(ratings.mvps) as mvps,
           max(ratings.power_rating) as power_rating
    from public.player_ratings ratings
    where ratings.player_id = any(v_athletes)
    group by ratings.player_id
  ) totals
  where badges.athlete_id = totals.athlete_id
    and badges.badge_key <> 'rookie'
    and (
      (badges.badge_key = 'first_match' and totals.matches_played < 1)
      or (badges.badge_key = 'first_win' and totals.wins < 1)
      or (badges.badge_key = 'goal_hunter' and totals.goals < 1)
      or (badges.badge_key = 'playmaker' and totals.assists < 1)
      or (badges.badge_key = 'clean_sheet' and totals.clean_sheets < 1)
      or (badges.badge_key = 'match_mvp' and totals.mvps < 1)
      or (badges.badge_key = 'road_warrior' and totals.matches_played < 10)
      or (badges.badge_key = 'rising_star' and totals.power_rating < 1500)
    );

  delete from public.athlete_achievements achievements
  where achievements.athlete_id = any(v_athletes)
    and achievements.identity_badge_key is not null
    and not exists (
      select 1 from public.athlete_badges badges
      where badges.athlete_id = achievements.athlete_id
        and badges.badge_key = achievements.identity_badge_key
    );

  update public.match_results
  set status = 'void', updated_at = now()
  where id = p_match_result_id;

  return v_reverted;
end;
$$;

revoke all on function public.void_match_result_safely(uuid) from public, anon, service_role;
grant execute on function public.void_match_result_safely(uuid) to authenticated;

do $$
begin
  if position('v_role is null' in (select prosrc from pg_proc where oid = 'public.void_match_result_safely(uuid)'::regprocedure)) = 0 then
    raise exception 'SQL65: the null-safe permission check is not in place';
  end if;
  if has_function_privilege('anon', 'public.void_match_result_safely(uuid)', 'execute')
     or has_function_privilege('service_role', 'public.void_match_result_safely(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.void_match_result_safely(uuid)', 'execute') then
    raise exception 'SQL65: void_match_result_safely privileges are wrong';
  end if;
end;
$$;

commit;
