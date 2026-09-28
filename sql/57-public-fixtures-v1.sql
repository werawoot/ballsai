-- 57-public-fixtures-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first; Production (hivedzrwrrcnjrlirhtv)
-- only with separate owner approval. Apply after SQL56 and AFTER SQL50: SQL50 removes
-- signed-out EXECUTE from every definer function that exists when it runs, and the
-- public reader below is meant to be callable by signed-out visitors. Run as postgres.
--
-- Why: players, parents and fans need to see the draw and the tables, but team names are
-- not public today (teams RLS: creator, organizer, admin). A draw becomes public only
-- when its organizer publishes it, and then only what a fixture list needs.
--
-- What:
--   * tournaments.fixtures_published_at: null = private (the default for every draw);
--   * set_fixtures_published_safely(id, on/off): the organizer or an admin only, locking
--     the tournament row like SQL55/56;
--   * public_tournament_fixtures(id): for a published draw only, each fixture with team
--     ids and names, sources, the confirmed score turned to home/away, the knockout winner,
--     and each team's registration order (the last tiebreak, as in SQL56). No team
--     members, no creator, no profile.

begin;

do $$
begin
  if to_regclass('public.tournament_fixtures') is null then raise exception 'SQL57 needs SQL55 applied first'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public'
                 and table_name = 'tournament_fixtures' and column_name = 'winner_team_id') then
    raise exception 'SQL57 needs SQL56 applied first';
  end if;
end;
$$;

alter table public.tournaments add column if not exists fixtures_published_at timestamptz;

create function public.set_fixtures_published_safely(p_tournament_id uuid, p_published boolean)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_organizer uuid;
  v_at timestamptz;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select t.organizer_id into v_organizer from public.tournaments t where t.id = p_tournament_id for update;
  if not found then raise exception 'TOURNAMENT_NOT_FOUND' using errcode = '22023'; end if;
  if v_organizer is distinct from v_user and not public.is_admin() then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  update public.tournaments
  set fixtures_published_at = case when p_published then coalesce(fixtures_published_at, now()) else null end
  where id = p_tournament_id
  returning fixtures_published_at into v_at;
  return v_at;
end;
$$;

create function public.public_tournament_fixtures(p_tournament_id uuid)
returns table (
  fixture_key text, stage text, round integer, group_label text,
  home_team_id uuid, away_team_id uuid, home_name text, away_name text,
  home_source text, away_source text, home_score integer, away_score integer,
  winner_team_id uuid, home_order integer, away_order integer
)
language sql stable security definer set search_path = '' as $$
  with published as (
    select t.id from public.tournaments t where t.id = p_tournament_id and t.fixtures_published_at is not null
  ), team_order as (
    select tm.id, tm.name, (row_number() over (order by tm.created_at, tm.id))::integer as position
    from public.teams tm join published p on p.id = tm.tournament_id
  )
  select f.fixture_key, f.stage, f.round, f.group_label,
         f.home_team_id, f.away_team_id, h.name, a.name,
         f.home_source, f.away_source,
         case when m.id is null then null when m.team_a_id = f.home_team_id then m.team_a_score else m.team_b_score end,
         case when m.id is null then null when m.team_a_id = f.home_team_id then m.team_b_score else m.team_a_score end,
         f.winner_team_id, h.position, a.position
  from public.tournament_fixtures f
  join published p on p.id = f.tournament_id
  left join team_order h on h.id = f.home_team_id
  left join team_order a on a.id = f.away_team_id
  left join public.match_results m on m.id = f.match_result_id and m.status = 'confirmed'
  order by case f.stage when 'group' then 1 when 'league' then 2 else 3 end, f.group_label, f.round, f.fixture_key
$$;

revoke all on function public.set_fixtures_published_safely(uuid, boolean) from public, anon, service_role;
grant execute on function public.set_fixtures_published_safely(uuid, boolean) to authenticated;
revoke all on function public.public_tournament_fixtures(uuid) from public;
grant execute on function public.public_tournament_fixtures(uuid) to anon, authenticated;

do $$
begin
  if not has_function_privilege('anon', 'public.public_tournament_fixtures(uuid)', 'EXECUTE') then
    raise exception 'SQL57 signed-out visitors cannot read published fixtures';
  end if;
  if has_function_privilege('anon', 'public.set_fixtures_published_safely(uuid, boolean)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.set_fixtures_published_safely(uuid, boolean)', 'EXECUTE') then
    raise exception 'SQL57 set_fixtures_published_safely privileges wrong';
  end if;
  if exists (select 1 from public.tournaments where fixtures_published_at is not null) then
    raise exception 'SQL57 found a tournament already published: every draw must start private';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
