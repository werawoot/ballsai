-- Rollback for SQL93, same project, owner approval. Reads still work without the index,
-- only slower; nothing depends on it by name.

begin;
drop index if exists public.player_ratings_player_sport_season_idx;
commit;
