-- 61-first-match-rank-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first; Production (hivedzrwrrcnjrlirhtv)
-- only with separate owner approval. Depends on SQL60 (record_match_result_once) and on
-- the unique index player_ranks_player_sport_season_idx (link-player-ranks-to-profiles).
-- Run as postgres. Precheck: sql/61-first-match-rank-precheck.sql.
--
-- Why (T32): an athlete earns Power Rating and XP only through a player_ranks row, and
-- only an admin could create one (/admin/create). Every new athlete therefore waited on
-- a person, and /dashboard/results silently left out roster members without a row. That
-- does not work nationwide.
--
-- Decision (owner, 29 Sep 2026): the row is created by the first verified match, not at
-- sign-up. Until then the card stays STARTER and the athlete is not in /ranking. The
-- skill ratings (PAC, SHO, PAS, DRI, DEF) are a coach's or admin's assessment, so a row
-- made by a match leaves them empty (NULL) instead of showing a default as performance.
-- OVR and Power Rating come from verified results only.
--
-- Privacy: player_ranks is readable by anyone, so a row publishes a name, team, province
-- and results. It is created automatically only for an athlete whose profile is already
-- public (athlete_profiles.is_public), which the guardian consent trigger allows only
-- with a birth date and, for a minor, recorded guardian consent. A private athlete's
-- result is refused with ATHLETE_NOT_PUBLIC; nothing about them is written.
--
-- What:
--   * player_ranks.pac/sho/pas/dri/def and position may be NULL (a no-op where they are
--     already nullable). NULL means "not assessed yet".
--   * record_match_result_first_rank(request id, match, performances, sport, season):
--     performances may name an athlete by athleteId instead of playerRankId. For each
--     such item, after the same organizer/admin check as the recording, it requires an
--     accepted roster member of that item's team (team A or B of this tournament) with a
--     public profile for the sport, then creates the rank row and its rating row if
--     missing (on conflict do nothing: two concurrent matches create one row), and
--     records the match through record_match_result_once in the same transaction. A
--     failed recording rolls the new rows back, so a rank row exists only with a match.
--   * authenticated may execute it; anon and PUBLIC may not.

begin;

do $$
begin
  if to_regprocedure('public.record_match_result_once(uuid, uuid, uuid, uuid, integer, integer, jsonb)') is null then
    raise exception 'SQL61 needs SQL60 (record_match_result_once) first';
  end if;
  if not exists (
    select 1 from pg_index i
    join pg_class c on c.oid = i.indexrelid
    where i.indrelid = 'public.player_ranks'::regclass and i.indisunique
      and c.relname = 'player_ranks_player_sport_season_idx'
  ) then
    raise exception 'SQL61 needs the unique index player_ranks_player_sport_season_idx';
  end if;
end;
$$;

alter table public.player_ranks
  alter column pac drop not null,
  alter column sho drop not null,
  alter column pas drop not null,
  alter column dri drop not null,
  alter column def drop not null,
  alter column position drop not null;

comment on column public.player_ranks.pac is 'Skill rating from a coach or admin assessment; NULL = not assessed yet (sql/61).';

create function public.record_match_result_first_rank(
  p_request_id uuid,
  p_tournament_id uuid,
  p_team_a_id uuid,
  p_team_b_id uuid,
  p_team_a_score integer,
  p_team_b_score integer,
  p_performances jsonb,
  p_sport text,
  p_season text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_organizer uuid;
  v_item jsonb;
  v_items jsonb := '[]'::jsonb;
  v_athlete uuid;
  v_team uuid;
  v_team_name text;
  v_profile record;
  v_rank uuid;
  v_seen uuid[] := '{}';
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_performances is null or jsonb_typeof(p_performances) <> 'array'
     or nullif(btrim(p_sport), '') is null or nullif(btrim(p_season), '') is null then
    raise exception 'INVALID_MATCH_DATA' using errcode = '22023';
  end if;

  -- The same rule as record_match_result_safely, checked before anything is created.
  select role into v_role from public.profiles where id = v_user;
  select organizer_id into v_organizer from public.tournaments where id = p_tournament_id;
  if not found then
    raise exception 'TOURNAMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if coalesce(v_role, '') not in ('organizer', 'admin') or (v_role <> 'admin' and v_organizer is distinct from v_user) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  for v_item in select value from jsonb_array_elements(p_performances) loop
    if nullif(v_item->>'playerRankId', '') is not null or nullif(v_item->>'athleteId', '') is null then
      v_items := v_items || jsonb_build_array(v_item);
      continue;
    end if;

    begin
      v_athlete := (v_item->>'athleteId')::uuid;
      v_team := (v_item->>'teamId')::uuid;
    exception when invalid_text_representation then
      raise exception 'INVALID_PERFORMANCE_DATA' using errcode = '22023';
    end;
    if v_team not in (p_team_a_id, p_team_b_id) or v_athlete = any(v_seen) then
      raise exception 'INVALID_PERFORMANCE_DATA' using errcode = '22023';
    end if;
    v_seen := v_seen || v_athlete;

    select t.name into v_team_name
    from public.teams t
    join public.team_members m on m.team_id = t.id
    where t.id = v_team and t.tournament_id = p_tournament_id
      and m.athlete_id = v_athlete and m.status = 'accepted';
    if not found then
      raise exception 'NOT_ON_ROSTER' using errcode = '42501';
    end if;

    select a.display_name, a.province, a.position into v_profile
    from public.athlete_profiles a
    where a.user_id = v_athlete and a.sport = p_sport and a.is_public;
    if not found then
      raise exception 'ATHLETE_NOT_PUBLIC' using errcode = '42501';
    end if;

    insert into public.player_ranks (
      player_id, player_name, team, province, position, sport, season,
      ovr, pts, pac, sho, pas, dri, def, rank_change
    ) values (
      v_athlete,
      left(coalesce(nullif(btrim(v_profile.display_name), ''), 'Athlete'), 120),
      left(v_team_name, 120),
      left(v_profile.province, 120),
      case when upper(v_profile.position) in ('GK', 'DF', 'MF', 'FW') then upper(v_profile.position) end,
      p_sport, p_season,
      -- OVR and Power Rating at the start of the rating scale; the match below moves both.
      60, 1000, null, null, null, null, null, 0
    )
    -- The unique index is partial (where player_id is not null), so the conflict target
    -- repeats its predicate; without it Postgres finds no matching index.
    on conflict (player_id, sport, season) where player_id is not null do nothing;

    select r.id into v_rank from public.player_ranks r
    where r.player_id = v_athlete and r.sport = p_sport and r.season = p_season;

    insert into public.player_ratings (player_id, player_rank_id, sport, season, power_rating)
    select v_athlete, r.id, r.sport, r.season, greatest(0, least(3000, coalesce(r.pts, 1000)))
    from public.player_ranks r where r.id = v_rank
    on conflict (player_rank_id, sport, season) do nothing;

    v_items := v_items || jsonb_build_array((v_item - 'athleteId') || jsonb_build_object('playerRankId', v_rank));
  end loop;

  -- Records the match (and repeats return the first result). Any failure here rolls
  -- back the rows created above.
  return public.record_match_result_once(
    p_request_id, p_tournament_id, p_team_a_id, p_team_b_id, p_team_a_score, p_team_b_score, v_items
  );
end;
$$;

revoke all on function public.record_match_result_first_rank(uuid, uuid, uuid, uuid, integer, integer, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.record_match_result_first_rank(uuid, uuid, uuid, uuid, integer, integer, jsonb, text, text) to authenticated, service_role;

do $$
begin
  if has_function_privilege('anon', 'public.record_match_result_first_rank(uuid, uuid, uuid, uuid, integer, integer, jsonb, text, text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.record_match_result_first_rank(uuid, uuid, uuid, uuid, integer, integer, jsonb, text, text)', 'EXECUTE') then
    raise exception 'SQL61 function privileges are wrong';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'player_ranks'
      and column_name in ('pac', 'sho', 'pas', 'dri', 'def', 'position') and is_nullable = 'NO'
  ) then
    raise exception 'SQL61 left a skill rating column NOT NULL';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
