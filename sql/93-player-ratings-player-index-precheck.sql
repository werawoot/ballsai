-- Read-only precheck for SQL93, same project.
-- Expected: ratings_table true; idx_exists false; rows small (a plain CREATE INDEX briefly
-- blocks writes to player_ratings; see the note in the v1 file above a few tens of thousands).
-- No backslash or asterisk, so it survives copy and paste from chat.

select to_regclass('public.player_ratings') is not null as ratings_table,
       to_regclass('public.player_ratings_player_sport_season_idx') is not null as idx_exists,
       (select count(id) from public.player_ratings) as rows;
