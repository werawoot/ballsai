-- Read-only postcheck for SQL93, same project.
-- Expected: idx_valid true.
-- No backslash or asterisk, so it survives copy and paste from chat.

select exists (
         select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = 'player_ratings_player_sport_season_idx' and i.indisvalid
       ) as idx_valid;
