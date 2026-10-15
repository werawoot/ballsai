-- Rollback for SQL79, same project, owner approval. Removes the delete function only; teams
-- already deleted are not brought back. The indexes are harmless and stay (drop them by
-- hand if wanted: match_results_team_a_idx, match_results_team_b_idx,
-- match_player_performances_team_idx, tournament_fixtures_home_idx,
-- tournament_fixtures_away_idx, tournament_fixtures_winner_idx).

begin;
drop function if exists public.delete_my_team(uuid, text);
commit;
