-- 94-public-scout-athletes-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first, Production (hivedzrwrrcnjrlirhtv) only
-- with separate owner approval. Read the Project ID in Settings > General before each run.
-- Run as postgres. Depends on sql/58 (public_athlete_directory, public profiles only, no
-- birth date), sql/53 (athlete_profiles_directory_page_idx), production-hardening
-- (player_ranks_public_ranking_idx) and athlete-profile-v2 (player_ranks_player_sport_season_idx). Precheck: sql/94-public-scout-athletes-precheck.sql. Postcheck:
-- sql/94-public-scout-athletes-postcheck.sql. Rollback: sql/94-public-scout-athletes-down.sql.
--
-- Why (T52, owner chose the database way on 27 Oct 2026): /scout read the first 150 public
-- profiles in no order, then sorted by Power Rating and filtered in the browser. Athlete
-- 151 and later could never be found, however strong.
-- What: one function for one page of /scout. Public profiles of a sport only (the SQL58
-- view, which applies the caller's RLS), with that season's Power Rating; highest first
-- (the user id breaks ties), then athletes with no rating yet (STARTER cards), newest first.
-- A rank row without points counts as no rating, so it never leads the list.
-- Name (a plain substring, case-insensitive, so % and _ are literal), province, position
-- and a minimum rating are filtered in the database. A page holds at most 50 rows; a larger
-- or negative request is refused, never silently cut.
-- SECURITY INVOKER: it reads only what the caller may read. No birth date or consent time
-- is in the view or in the result.
-- Scale: rated athletes are read in rating order from player_ranks_public_ranking_idx and
-- joined by primary key; unrated ones in directory order from athlete_profiles_directory_page_idx
-- (sql/53) with one rank probe each (player_ranks_player_sport_season_idx). A page stops
-- after its rows; it never sorts every profile. Sandbox numbers: runbook row 94.

begin;

do $$
begin
  if to_regclass('public.public_athlete_directory') is null or to_regclass('public.player_ranks') is null
     or to_regclass('public.player_ranks_player_sport_season_idx') is null
     or to_regclass('public.player_ranks_public_ranking_idx') is null
     or to_regclass('public.athlete_profiles_directory_page_idx') is null then
    raise exception 'SQL94 needs sql/58, sql/53, production-hardening and the player_ranks unique index';
  end if;
end;
$$;

create or replace function public.public_scout_athletes(
  p_sport text,
  p_season text,
  p_search text default null,
  p_province text default null,
  p_position text default null,
  p_min_power integer default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  user_id uuid, display_name text, "position" text, province text, current_team text,
  verification_level text, rank_id uuid, power integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_search text := nullif(lower(btrim(coalesce(p_search, ''))), '');
  v_rows integer;
  v_ranked bigint;
begin
  if p_limit is null or p_limit < 1 or p_limit > 50 or p_offset is null or p_offset < 0 then
    raise exception 'SCOUT_PAGE_INVALID' using errcode = '22023';
  end if;

  -- Rated athletes first, read in rating order from player_ranks_public_ranking_idx, so a
  -- page stops after its rows instead of sorting every public profile.
  return query
    select d.user_id, d.display_name::text, d.position::text, d.province::text, d.current_team::text,
           d.verification_level::text, r.id, r.pts::integer
    from public.player_ranks r
    join public.public_athlete_directory d on d.user_id = r.player_id and d.sport = r.sport
    where r.sport = p_sport and r.season = p_season and r.player_id is not null and r.pts is not null
      and (v_search is null or strpos(lower(d.display_name), v_search) > 0)
      and (p_province is null or d.province = p_province)
      and (p_position is null or d.position = p_position)
      and (p_min_power is null or r.pts >= p_min_power)
    order by r.pts desc, r.player_id
    limit p_limit offset p_offset;
  get diagnostics v_rows = row_count;
  if v_rows = p_limit or p_min_power is not null then
    return;
  end if;

  -- How many rated athletes match: known from this page when it held some or when it is the
  -- first page, counted only when the page lies wholly past them.
  if v_rows > 0 or p_offset = 0 then
    v_ranked := p_offset + v_rows;
  else
    select count(1) into v_ranked
    from public.player_ranks r
    join public.public_athlete_directory d on d.user_id = r.player_id and d.sport = r.sport
    where r.sport = p_sport and r.season = p_season and r.player_id is not null and r.pts is not null
      and (v_search is null or strpos(lower(d.display_name), v_search) > 0)
      and (p_province is null or d.province = p_province)
      and (p_position is null or d.position = p_position);
  end if;

  -- Then athletes with no rating this season (no rank row, or one without points: STARTER
  -- cards), newest first, in the order
  -- athlete_profiles_directory_page_idx (sql/53) keeps.
  return query
    select d.user_id, d.display_name::text, d.position::text, d.province::text, d.current_team::text,
           d.verification_level::text, null::uuid, null::integer
    from public.public_athlete_directory d
    where d.sport = p_sport
      and not exists (select 1 from public.player_ranks r
                      where r.player_id = d.user_id and r.sport = d.sport and r.season = p_season
                        and r.pts is not null)
      and (v_search is null or strpos(lower(d.display_name), v_search) > 0)
      and (p_province is null or d.province = p_province)
      and (p_position is null or d.position = p_position)
    order by d.created_at desc, d.user_id
    limit p_limit - v_rows offset greatest(p_offset - v_ranked, 0);
end;
$$;

revoke all on function public.public_scout_athletes(text, text, text, text, text, integer, integer, integer) from public;
grant execute on function public.public_scout_athletes(text, text, text, text, text, integer, integer, integer) to anon, authenticated, service_role;

do $$
begin
  if (select prosecdef from pg_proc where oid = 'public.public_scout_athletes(text,text,text,text,text,integer,integer,integer)'::regprocedure)
     or not has_function_privilege('anon', 'public.public_scout_athletes(text,text,text,text,text,integer,integer,integer)', 'execute') then
    raise exception 'SQL94 self-check failed';
  end if;
end;
$$;

commit;
