-- 56-fixture-results-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first; Production (hivedzrwrrcnjrlirhtv)
-- only with separate owner approval. Apply after SQL55 and match-result-void-v1. Run as
-- postgres.
--
-- Why: SQL55 stores a draw, but nothing moved it on. Organizers would have had to fill
-- every later round by hand, which does not scale past a handful of tournaments.
--
-- What, all in the database and in the same transaction as the result:
--   * a confirmed result recorded through record_match_result_safely links itself to the
--     earliest open fixture with the same two teams (group, then league, then knockout;
--     then round and key). A result with no such fixture stays an ordinary result;
--   * a knockout winner moves into every fixture that reads "winner:<key>". A drawn
--     knockout waits: the organizer picks the winner (penalties) with
--     set_fixture_winner_safely;
--   * when every fixture of a group has a result, the group's first and second places
--     fill "group:<X>:1" and "group:<X>:2": points (3/1/0), goal difference, goals scored,
--     then registration order (teams.created_at, id), the order the app shows too;
--   * voiding a linked result (match-result-void) unlinks it and takes back what it
--     advanced. If a later match already used that advance, the void is refused with
--     FIXTURE_ALREADY_ADVANCED: void the later match first;
--   * every change to a draw locks the tournament row, like SQL55, so two results
--     recorded at once cannot overwrite each other's advances.
-- A side now keeps its source ("winner:…", "group:…") after the team is filled in, so the
-- page can still say where a team came from; SQL55's either-or checks become "at least one".

begin;

do $$
declare
  v_name text;
begin
  if to_regclass('public.tournament_fixtures') is null then raise exception 'SQL56 needs SQL55 applied first'; end if;
  if to_regprocedure('public.void_match_result_safely(uuid)') is null
     and not exists (select 1 from pg_proc where proname = 'void_match_result_safely') then
    raise exception 'SQL56 needs match-result-void-v1 applied first';
  end if;
  -- SQL55's two either-or side checks, found by their definition, not by a generated name.
  for v_name in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.tournament_fixtures'::regclass and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%<>%' and pg_get_constraintdef(c.oid) like '%_source IS NULL%'
  loop
    execute format('alter table public.tournament_fixtures drop constraint %I', v_name);
  end loop;
end;
$$;

alter table public.tournament_fixtures
  add column winner_team_id uuid references public.teams(id) on delete restrict,
  add constraint tournament_fixtures_home_side check (home_team_id is not null or home_source is not null),
  add constraint tournament_fixtures_away_side check (away_team_id is not null or away_source is not null);

create function public.advance_fixture_winner(p_tournament_id uuid, p_fixture_key text, p_winner uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.tournament_fixtures set winner_team_id = p_winner
  where tournament_id = p_tournament_id and fixture_key = p_fixture_key;
  update public.tournament_fixtures set home_team_id = p_winner
  where tournament_id = p_tournament_id and home_source = 'winner:' || p_fixture_key and match_result_id is null;
  update public.tournament_fixtures set away_team_id = p_winner
  where tournament_id = p_tournament_id and away_source = 'winner:' || p_fixture_key and match_result_id is null;
end;
$$;

create function public.fill_group_places(p_tournament_id uuid, p_group text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.tournament_fixtures f
             where f.tournament_id = p_tournament_id and f.stage = 'group' and f.group_label = p_group
               and f.match_result_id is null) then
    return;
  end if;

  with played as (
    select m.team_a_id, m.team_b_id, m.team_a_score, m.team_b_score
    from public.tournament_fixtures f join public.match_results m on m.id = f.match_result_id
    where f.tournament_id = p_tournament_id and f.stage = 'group' and f.group_label = p_group and m.status = 'confirmed'
  ), sides as (
    select team_a_id as team_id, team_a_score as scored, team_b_score as conceded from played
    union all select team_b_id, team_b_score, team_a_score from played
  ), members as (
    select home_team_id as team_id from public.tournament_fixtures
    where tournament_id = p_tournament_id and stage = 'group' and group_label = p_group
    union select away_team_id from public.tournament_fixtures
    where tournament_id = p_tournament_id and stage = 'group' and group_label = p_group
  ), table_rows as (
    select mb.team_id, tm.created_at,
           coalesce(sum(case when s.scored > s.conceded then 3 when s.scored = s.conceded then 1 else 0 end), 0) as points,
           coalesce(sum(s.scored - s.conceded), 0) as goal_difference,
           coalesce(sum(s.scored), 0) as goals_for
    from members mb join public.teams tm on tm.id = mb.team_id
    left join sides s on s.team_id = mb.team_id
    group by mb.team_id, tm.created_at
  ), ranked as (
    select team_id, row_number() over (order by points desc, goal_difference desc, goals_for desc, created_at, team_id) as place
    from table_rows
  )
  update public.tournament_fixtures f set
    home_team_id = case when f.home_source = 'group:' || p_group || ':' || r.place then r.team_id else f.home_team_id end,
    away_team_id = case when f.away_source = 'group:' || p_group || ':' || r.place then r.team_id else f.away_team_id end
  from ranked r
  where f.tournament_id = p_tournament_id and f.match_result_id is null and r.place <= 2
    and (f.home_source = 'group:' || p_group || ':' || r.place or f.away_source = 'group:' || p_group || ':' || r.place);
end;
$$;

create function public.link_fixture_on_result()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_fixture public.tournament_fixtures%rowtype;
begin
  if new.status <> 'confirmed' then return new; end if;
  perform 1 from public.tournaments t where t.id = new.tournament_id for update;

  select f.* into v_fixture from public.tournament_fixtures f
  where f.tournament_id = new.tournament_id and f.match_result_id is null
    and f.home_team_id is not null and f.away_team_id is not null
    and ((f.home_team_id = new.team_a_id and f.away_team_id = new.team_b_id)
      or (f.home_team_id = new.team_b_id and f.away_team_id = new.team_a_id))
  order by case f.stage when 'group' then 1 when 'league' then 2 else 3 end, f.round, f.fixture_key
  limit 1
  for update;
  if not found then return new; end if;

  update public.tournament_fixtures set match_result_id = new.id where id = v_fixture.id;
  if v_fixture.stage = 'knockout' and new.team_a_score <> new.team_b_score then
    perform public.advance_fixture_winner(new.tournament_id, v_fixture.fixture_key,
      case when new.team_a_score > new.team_b_score then new.team_a_id else new.team_b_id end);
  elsif v_fixture.stage = 'group' then
    perform public.fill_group_places(new.tournament_id, v_fixture.group_label);
  end if;
  return new;
end;
$$;

create function public.unlink_fixture_on_void()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_fixture public.tournament_fixtures%rowtype;
begin
  perform 1 from public.tournaments t where t.id = new.tournament_id for update;
  select f.* into v_fixture from public.tournament_fixtures f where f.match_result_id = new.id for update;
  if not found then return new; end if;

  if v_fixture.stage = 'knockout' then
    if exists (select 1 from public.tournament_fixtures d
               where d.tournament_id = v_fixture.tournament_id and d.match_result_id is not null
                 and (d.home_source = 'winner:' || v_fixture.fixture_key or d.away_source = 'winner:' || v_fixture.fixture_key)) then
      raise exception 'FIXTURE_ALREADY_ADVANCED' using errcode = '55000';
    end if;
    update public.tournament_fixtures set home_team_id = null
    where tournament_id = v_fixture.tournament_id and home_source = 'winner:' || v_fixture.fixture_key;
    update public.tournament_fixtures set away_team_id = null
    where tournament_id = v_fixture.tournament_id and away_source = 'winner:' || v_fixture.fixture_key;
  elsif v_fixture.stage = 'group' then
    if exists (select 1 from public.tournament_fixtures d
               where d.tournament_id = v_fixture.tournament_id and d.match_result_id is not null
                 and (d.home_source like 'group:' || v_fixture.group_label || ':%' or d.away_source like 'group:' || v_fixture.group_label || ':%')) then
      raise exception 'FIXTURE_ALREADY_ADVANCED' using errcode = '55000';
    end if;
    update public.tournament_fixtures set home_team_id = null
    where tournament_id = v_fixture.tournament_id and home_source like 'group:' || v_fixture.group_label || ':%';
    update public.tournament_fixtures set away_team_id = null
    where tournament_id = v_fixture.tournament_id and away_source like 'group:' || v_fixture.group_label || ':%';
  end if;

  update public.tournament_fixtures set match_result_id = null, winner_team_id = null where id = v_fixture.id;
  return new;
end;
$$;

create function public.set_fixture_winner_safely(p_tournament_id uuid, p_fixture_key text, p_winner_team_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_organizer uuid;
  v_fixture public.tournament_fixtures%rowtype;
  v_result public.match_results%rowtype;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select t.organizer_id into v_organizer from public.tournaments t where t.id = p_tournament_id for update;
  if not found then raise exception 'TOURNAMENT_NOT_FOUND' using errcode = '22023'; end if;
  if v_organizer is distinct from v_user and not public.is_admin() then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  select f.* into v_fixture from public.tournament_fixtures f
  where f.tournament_id = p_tournament_id and f.fixture_key = p_fixture_key for update;
  select m.* into v_result from public.match_results m where m.id = v_fixture.match_result_id;
  if v_fixture.id is null or v_fixture.stage <> 'knockout' or v_result.id is null
     or v_result.status <> 'confirmed' or v_result.team_a_score <> v_result.team_b_score then
    raise exception 'NOT_A_DRAWN_KNOCKOUT' using errcode = '22023';
  end if;
  if p_winner_team_id is null or p_winner_team_id not in (v_fixture.home_team_id, v_fixture.away_team_id) then
    raise exception 'WINNER_NOT_IN_MATCH' using errcode = '22023';
  end if;
  if exists (select 1 from public.tournament_fixtures d
             where d.tournament_id = p_tournament_id and d.match_result_id is not null
               and (d.home_source = 'winner:' || p_fixture_key or d.away_source = 'winner:' || p_fixture_key)) then
    raise exception 'FIXTURE_ALREADY_ADVANCED' using errcode = '55000';
  end if;
  perform public.advance_fixture_winner(p_tournament_id, p_fixture_key, p_winner_team_id);
end;
$$;

create trigger match_results_link_fixture
after insert on public.match_results for each row execute function public.link_fixture_on_result();

create trigger match_results_unlink_fixture
after update of status on public.match_results for each row when (new.status = 'void' and old.status is distinct from 'void') execute function public.unlink_fixture_on_void();

revoke all on function public.advance_fixture_winner(uuid, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.fill_group_places(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.link_fixture_on_result() from public, anon, authenticated, service_role;
revoke all on function public.unlink_fixture_on_void() from public, anon, authenticated, service_role;
revoke all on function public.set_fixture_winner_safely(uuid, text, uuid) from public, anon, service_role;
grant execute on function public.set_fixture_winner_safely(uuid, text, uuid) to authenticated;

do $$
declare
  v_fn text;
begin
  if (select count(*) from pg_constraint c where c.conrelid = 'public.tournament_fixtures'::regclass
        and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%<>%' and pg_get_constraintdef(c.oid) like '%_source IS NULL%') <> 0 then
    raise exception 'SQL56 left an either-or side check in place';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'match_results_link_fixture' and not tgisinternal)
     or not exists (select 1 from pg_trigger where tgname = 'match_results_unlink_fixture' and not tgisinternal) then
    raise exception 'SQL56 triggers missing';
  end if;
  foreach v_fn in array array['public.advance_fixture_winner(uuid, text, uuid)', 'public.fill_group_places(uuid, text)',
                              'public.link_fixture_on_result()', 'public.unlink_fixture_on_void()'] loop
    if has_function_privilege('authenticated', v_fn, 'EXECUTE') or has_function_privilege('anon', v_fn, 'EXECUTE') then
      raise exception 'SQL56: a client can execute %', v_fn;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.set_fixture_winner_safely(uuid, text, uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.set_fixture_winner_safely(uuid, text, uuid)', 'EXECUTE') then
    raise exception 'SQL56 set_fixture_winner_safely privileges wrong';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
