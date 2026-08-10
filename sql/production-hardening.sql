-- BallDoenSai.com production hardening
-- Apply after sql/supabase-rls.sql and sql/ballsai-rating-v1.sql.
-- Run this in the Supabase SQL editor during a low-traffic period.

-- Public discovery queries
create index if not exists player_ranks_public_ranking_idx
  on public.player_ranks (sport, season, pts desc);

create index if not exists tournaments_open_start_date_idx
  on public.tournaments (start_date asc)
  where status = 'open';

create index if not exists teams_creator_created_at_idx
  on public.teams (created_by, created_at desc);

create index if not exists payments_slip_url_idx
  on public.payments (slip_url)
  where slip_url is not null;

-- Keep payment evidence private. The application stores only the object path
-- and issues a short-lived signed URL after checking the viewer's role.
update storage.buckets set public = false where id = 'slips';

drop policy if exists "slips_public_read" on storage.objects;
drop policy if exists "slips_read_owner_organizer_admin" on storage.objects;
create policy "slips_read_owner_organizer_admin"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'slips'
  and (
    split_part(name, '_', 1) = (select auth.uid())::text
    or (select public.is_admin())
    or exists (
      select 1
      from public.payments p
      join public.tournaments tr on tr.id = p.tournament_id
      where (p.slip_url = storage.objects.name or p.slip_url like '%' || storage.objects.name)
        and tr.organizer_id = (select auth.uid())
    )
  )
);

-- Serializes registration for one tournament by locking its row. This prevents
-- a burst of requests from exceeding max_teams between a count and an insert.
create or replace function public.register_team_safely(
  p_tournament_id uuid,
  p_name text,
  p_members text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tournament public.tournaments%rowtype;
  v_team_id uuid;
  v_team_count integer;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_tournament
  from public.tournaments
  where id = p_tournament_id
  for update;

  if not found then
    raise exception 'TOURNAMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_tournament.status <> 'open' then
    raise exception 'TOURNAMENT_CLOSED' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.teams
    where tournament_id = p_tournament_id and created_by = v_user_id
  ) then
    raise exception 'ALREADY_REGISTERED' using errcode = '23505';
  end if;

  if v_tournament.max_teams is not null then
    select count(*) into v_team_count
    from public.teams
    where tournament_id = p_tournament_id;

    if v_team_count >= v_tournament.max_teams then
      raise exception 'TOURNAMENT_FULL' using errcode = 'P0001';
    end if;
  end if;

  insert into public.teams (name, members, tournament_id, created_by, status)
  values (trim(p_name), trim(p_members), p_tournament_id, v_user_id, 'pending')
  returning id into v_team_id;

  return v_team_id;
end;
$$;

revoke all on function public.register_team_safely(uuid, text, text) from public;
grant execute on function public.register_team_safely(uuid, text, text) to authenticated;

-- Updates payment and team together, with the payment row locked first.
create or replace function public.confirm_payment_safely(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_payment public.payments%rowtype;
  v_organizer_id uuid;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select role into v_role from public.profiles where id = v_user_id;
  if v_role not in ('organizer', 'admin') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select organizer_id into v_organizer_id
  from public.tournaments
  where id = v_payment.tournament_id;

  if v_role <> 'admin' and v_organizer_id <> v_user_id then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  update public.payments
  set status = 'confirmed'
  where id = v_payment.id and status <> 'confirmed';

  update public.teams
  set status = 'confirmed'
  where id = v_payment.team_id and status <> 'confirmed';
end;
$$;

revoke all on function public.confirm_payment_safely(uuid) from public;
grant execute on function public.confirm_payment_safely(uuid) to authenticated;

-- Persists a confirmed match, all player rating changes, rank changes, rating
-- events and performance records as one database transaction. The API computes
-- the rating preview but this function locks each rating and rejects a stale
-- preview instead of letting concurrent writes overwrite one another.
create or replace function public.record_match_result_safely(
  p_tournament_id uuid,
  p_team_a_id uuid,
  p_team_b_id uuid,
  p_team_a_score integer,
  p_team_b_score integer,
  p_performances jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_organizer_id uuid;
  v_match_id uuid;
  v_item jsonb;
  v_rating public.player_ratings%rowtype;
  v_rank public.player_ranks%rowtype;
  v_player_rank_id uuid;
  v_team_id uuid;
  v_result text;
  v_rating_before integer;
  v_rating_after integer;
  v_rating_change integer;
  v_match_change integer;
  v_performance_bonus integer;
  v_opponent_rating integer;
  v_goals integer;
  v_assists integer;
  v_clean_sheet boolean;
  v_mvp boolean;
  v_save_percentage numeric(5,2);
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select role into v_role from public.profiles where id = v_user_id;
  select organizer_id into v_organizer_id
  from public.tournaments
  where id = p_tournament_id
  for update;

  if not found then
    raise exception 'TOURNAMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_role not in ('organizer', 'admin') or (v_role <> 'admin' and v_organizer_id <> v_user_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_team_a_id = p_team_b_id or p_team_a_score < 0 or p_team_b_score < 0 or jsonb_array_length(p_performances) = 0 then
    raise exception 'INVALID_MATCH_DATA' using errcode = '22023';
  end if;
  if (
    select count(*) from public.teams
    where id in (p_team_a_id, p_team_b_id) and tournament_id = p_tournament_id
  ) <> 2 then
    raise exception 'INVALID_TEAMS' using errcode = '22023';
  end if;

  insert into public.match_results (
    tournament_id, team_a_id, team_b_id, team_a_score, team_b_score, created_by
  ) values (
    p_tournament_id, p_team_a_id, p_team_b_id, p_team_a_score, p_team_b_score, v_user_id
  ) returning id into v_match_id;

  for v_item in select value from jsonb_array_elements(p_performances) loop
    v_player_rank_id := (v_item->>'playerRankId')::uuid;
    v_team_id := (v_item->>'teamId')::uuid;
    v_result := v_item->>'result';
    v_rating_before := (v_item->>'ratingBefore')::integer;
    v_rating_after := (v_item->>'ratingAfter')::integer;
    v_rating_change := (v_item->>'ratingChange')::integer;
    v_match_change := (v_item->>'matchChange')::integer;
    v_performance_bonus := (v_item->>'performanceBonus')::integer;
    v_opponent_rating := (v_item->>'opponentRating')::integer;
    v_goals := coalesce((v_item->>'goals')::integer, 0);
    v_assists := coalesce((v_item->>'assists')::integer, 0);
    v_clean_sheet := coalesce((v_item->>'cleanSheet')::boolean, false);
    v_mvp := coalesce((v_item->>'mvp')::boolean, false);
    v_save_percentage := nullif(v_item->>'savePercentage', '')::numeric(5,2);

    if v_team_id not in (p_team_a_id, p_team_b_id)
      or v_result not in ('win', 'draw', 'loss')
      or v_rating_after not between 0 and 3000
      or v_opponent_rating not between 0 and 3000
      or v_goals < 0 or v_assists < 0 then
      raise exception 'INVALID_PERFORMANCE_DATA' using errcode = '22023';
    end if;

    select * into v_rank from public.player_ranks where id = v_player_rank_id;
    if not found then
      raise exception 'PLAYER_NOT_FOUND' using errcode = 'P0002';
    end if;

    select * into v_rating
    from public.player_ratings
    where player_rank_id = v_player_rank_id and sport = v_rank.sport and season = v_rank.season
    for update;
    if not found then
      raise exception 'RATING_NOT_FOUND' using errcode = 'P0002';
    end if;
    if v_rating.power_rating <> v_rating_before then
      raise exception 'RATING_CHANGED' using errcode = '40001';
    end if;

    update public.player_ratings set
      power_rating = v_rating_after,
      matches_played = v_rating.matches_played + 1,
      wins = v_rating.wins + case when v_result = 'win' then 1 else 0 end,
      draws = v_rating.draws + case when v_result = 'draw' then 1 else 0 end,
      losses = v_rating.losses + case when v_result = 'loss' then 1 else 0 end,
      goals = v_rating.goals + v_goals,
      assists = v_rating.assists + v_assists,
      clean_sheets = v_rating.clean_sheets + case when v_clean_sheet then 1 else 0 end,
      mvps = v_rating.mvps + case when v_mvp then 1 else 0 end,
      last_rating_change = v_rating_change,
      updated_at = now()
    where id = v_rating.id;

    update public.player_ranks set
      pts = v_rating_after,
      ovr = greatest(40, least(99, round(40 + (v_rating_after::numeric / 3000) * 59)::integer)),
      rank_change = v_rating_change
    where id = v_player_rank_id;

    insert into public.rating_events (
      player_rating_id, sport, match_id, result, opponent_rating, rating_before,
      rating_after, rating_change, match_change, performance_bonus, goals, assists,
      clean_sheet, mvp, save_percentage, created_by
    ) values (
      v_rating.id, v_rank.sport, v_match_id, v_result, v_opponent_rating, v_rating_before,
      v_rating_after, v_rating_change, v_match_change, v_performance_bonus, v_goals, v_assists,
      v_clean_sheet, v_mvp, v_save_percentage, v_user_id
    );

    insert into public.match_player_performances (
      match_result_id, player_rank_id, team_id, result, rating_before, rating_after,
      rating_change, goals, assists, clean_sheet, mvp, save_percentage
    ) values (
      v_match_id, v_player_rank_id, v_team_id, v_result, v_rating_before, v_rating_after,
      v_rating_change, v_goals, v_assists, v_clean_sheet, v_mvp, v_save_percentage
    );
  end loop;

  return v_match_id;
end;
$$;

revoke all on function public.record_match_result_safely(uuid, uuid, uuid, integer, integer, jsonb) from public;
grant execute on function public.record_match_result_safely(uuid, uuid, uuid, integer, integer, jsonb) to authenticated;
