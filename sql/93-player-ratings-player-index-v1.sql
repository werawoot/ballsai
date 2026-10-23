-- 93-player-ratings-player-index-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first; Production (hivedzrwrrcnjrlirhtv)
-- only with separate owner approval. Depends on ballsai-rating-v1.sql (player_ratings).
-- Precheck: sql/93-player-ratings-player-index-precheck.sql. Postcheck:
-- sql/93-player-ratings-player-index-postcheck.sql. Rollback:
-- sql/93-player-ratings-player-index-down.sql.
--
-- Why (T59): /career and /card read the signed-in athlete's own rating with
--   player_ratings where player_id = ? and sport = ? and season = ?
-- and player_ratings has no index that leads with player_id: only the unique
-- (player_rank_id, sport, season) and (sport, season, power_rating desc). Each view of
-- either page therefore reads every rating of the season to find one row. Sandbox, 200,000
-- ratings in one season: see runbook row 93 for the timings with and without the index.
--
-- Lock: a plain CREATE INDEX blocks writes to player_ratings while it builds (match results
-- write it). The table holds a handful of rows before closed beta; the precheck shows the
-- count. With tens of thousands of rows, build it with CREATE INDEX CONCURRENTLY outside a
-- transaction instead.

begin;

create index if not exists player_ratings_player_sport_season_idx
  on public.player_ratings (player_id, sport, season);

do $$
begin
  if not exists (
    select 1 from pg_index i
    join pg_class c on c.oid = i.indexrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'player_ratings_player_sport_season_idx' and i.indisvalid
  ) then
    raise exception 'SQL93 index player_ratings_player_sport_season_idx missing or invalid';
  end if;
end;
$$;

commit;
