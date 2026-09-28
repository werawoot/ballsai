-- 55-tournament-fixtures-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first; Production (hivedzrwrrcnjrlirhtv)
-- only with separate owner approval. Depends on the tournaments and teams tables, on
-- match_results and on public.is_admin(). Run as postgres.
--
-- Why: organizers draw their own brackets and league tables by hand today. The app now
-- generates a draw (lib/fixtures.ts: knockout, league, groups then knockout); this stores
-- it. One row per fixture. A side is either a team of this tournament or a reference to
-- where its team will come from: "winner:<fixture key>" or "group:<A-Z>:<1|2>".
--
-- Rules, all enforced here and not in the app:
--   * only the tournament's organizer or an admin may replace its draw;
--   * the tournament row is locked for the replacement, so two requests at once leave
--     one complete draw, never a mix of both;
--   * once any fixture of the tournament has a result, the draw can no longer be replaced;
--   * every team named is a confirmed team of this tournament, and no fixture has the
--     same team on both sides;
--   * every "winner:" reference names a fixture in the same draw.
-- Reads: the organizer and admins only, like teams. Public listing comes with slice 3.

begin;

create table public.tournament_fixtures (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  fixture_key text not null check (fixture_key ~ '^[A-Z0-9-]{1,40}$'),
  stage text not null check (stage in ('knockout', 'league', 'group')),
  round integer not null check (round between 1 and 64),
  group_label text check (group_label ~ '^[A-Z]$'),
  home_team_id uuid references public.teams(id) on delete restrict,
  away_team_id uuid references public.teams(id) on delete restrict,
  home_source text check (home_source ~ '^(winner:[A-Z0-9-]{1,40}|group:[A-Z]:[12])$'),
  away_source text check (away_source ~ '^(winner:[A-Z0-9-]{1,40}|group:[A-Z]:[12])$'),
  scheduled_at timestamptz,
  match_result_id uuid references public.match_results(id) on delete set null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (tournament_id, fixture_key),
  check ((home_team_id is null) <> (home_source is null)),
  check ((away_team_id is null) <> (away_source is null)),
  check (home_team_id is null or home_team_id is distinct from away_team_id)
);

create index tournament_fixtures_tournament_idx on public.tournament_fixtures (tournament_id, stage, round, fixture_key);
create index tournament_fixtures_result_idx on public.tournament_fixtures (match_result_id) where match_result_id is not null;

alter table public.tournament_fixtures enable row level security;
revoke all on public.tournament_fixtures from public, anon, authenticated;
grant select on public.tournament_fixtures to authenticated;

create policy tournament_fixtures_organizer_select on public.tournament_fixtures
for select to authenticated using (
  (select public.is_admin())
  or exists (select 1 from public.tournaments t where t.id = tournament_id and t.organizer_id = (select auth.uid()))
);

create function public.save_tournament_fixtures_safely(p_tournament_id uuid, p_fixtures jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_organizer uuid;
  v_count integer;
  v_bad text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;

  -- Lock the tournament: concurrent replacements run one after the other.
  select t.organizer_id into v_organizer from public.tournaments t where t.id = p_tournament_id for update;
  if not found then raise exception 'TOURNAMENT_NOT_FOUND' using errcode = '22023'; end if;
  if v_organizer is distinct from v_user and not public.is_admin() then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  if exists (select 1 from public.tournament_fixtures f where f.tournament_id = p_tournament_id and f.match_result_id is not null) then
    raise exception 'FIXTURES_HAVE_RESULTS' using errcode = '55000';
  end if;

  if jsonb_typeof(p_fixtures) is distinct from 'array' then raise exception 'FIXTURES_INVALID' using errcode = '22023'; end if;
  v_count := jsonb_array_length(p_fixtures);
  -- A 64-team league is 2,016 fixtures; nothing a tournament plays needs more.
  if v_count < 1 or v_count > 2100 then raise exception 'TOO_MANY_FIXTURES' using errcode = '22023'; end if;

  create temp table sql55_draw on commit drop as
  select x.key as fixture_key, x.stage, x.round, x.group_label,
         x.home_team_id, x.away_team_id, x.home_source, x.away_source
  from jsonb_to_recordset(p_fixtures) as x(key text, stage text, round integer, group_label text,
       home_team_id uuid, away_team_id uuid, home_source text, away_source text);

  if (select count(distinct fixture_key) from sql55_draw) <> v_count then
    raise exception 'FIXTURE_KEY_DUPLICATE' using errcode = '22023';
  end if;

  select string_agg(team_id::text, ', ') into v_bad from (
    select home_team_id as team_id from sql55_draw where home_team_id is not null
    union select away_team_id from sql55_draw where away_team_id is not null
  ) named
  where not exists (select 1 from public.teams tm where tm.id = named.team_id
                    and tm.tournament_id = p_tournament_id and tm.status = 'confirmed');
  if v_bad is not null then raise exception 'TEAM_NOT_CONFIRMED: %', v_bad using errcode = '22023'; end if;

  select string_agg(fixture_key, ', ') into v_bad from sql55_draw d
  where (d.home_source like 'winner:%' and not exists (select 1 from sql55_draw w where w.fixture_key = substr(d.home_source, 8)))
     or (d.away_source like 'winner:%' and not exists (select 1 from sql55_draw w where w.fixture_key = substr(d.away_source, 8)));
  if v_bad is not null then raise exception 'FIXTURE_SOURCE_INVALID: %', v_bad using errcode = '22023'; end if;

  delete from public.tournament_fixtures where tournament_id = p_tournament_id;
  -- The table's checks reject any malformed key, stage, round, group or side.
  insert into public.tournament_fixtures (tournament_id, fixture_key, stage, round, group_label,
    home_team_id, away_team_id, home_source, away_source, created_by)
  select p_tournament_id, fixture_key, stage, round, group_label, home_team_id, away_team_id, home_source, away_source, v_user
  from sql55_draw;

  drop table sql55_draw;
  return v_count;
end;
$$;

revoke all on function public.save_tournament_fixtures_safely(uuid, jsonb) from public, anon, service_role;
grant execute on function public.save_tournament_fixtures_safely(uuid, jsonb) to authenticated;

do $$
begin
  if to_regclass('public.tournament_fixtures') is null then raise exception 'SQL55 table missing'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.tournament_fixtures'::regclass) then
    raise exception 'SQL55 RLS is off';
  end if;
  if has_table_privilege('authenticated', 'public.tournament_fixtures', 'INSERT')
     or has_table_privilege('authenticated', 'public.tournament_fixtures', 'UPDATE')
     or has_table_privilege('authenticated', 'public.tournament_fixtures', 'DELETE')
     or has_table_privilege('anon', 'public.tournament_fixtures', 'SELECT') then
    raise exception 'SQL55 table privileges are wider than select for authenticated';
  end if;
  if has_function_privilege('anon', 'public.save_tournament_fixtures_safely(uuid, jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.save_tournament_fixtures_safely(uuid, jsonb)', 'EXECUTE') then
    raise exception 'SQL55 function privileges wrong';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
